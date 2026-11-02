<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Audit\AuditLogger;
use App\Services\Balance\MonthBalanceService;
use App\Services\CashPool\CashPool;
use App\Services\Month\Calendar;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Task K: pays a member their credit out of the cash pool (usually when they leave). A `final_payout`
 * ledger row (negative, fixed side) in the month of `paid_on` (a closed month's date goes to the current
 * month). Never more than the member's credit, never more than the cash pool.
 */
class FinalSettlement
{
    public function __construct(
        private readonly MonthBalanceService $balances,
        private readonly Calendar $calendar,
        private readonly AuditLogger $audit,
    ) {}

    /** @return array{id: int, member_id: int, month_id: int, amount_paisa: int, paid_on: string, credit_after_paisa: int, cash_pool_paisa: int} */
    public function pay(Mess $mess, MessMember $member, int $amountPaisa, string $paidOn, MessMember $by): array
    {
        return DB::transaction(function () use ($mess, $member, $amountPaisa, $paidOn, $by) {
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail(); // serialises payouts, repayments, closes

            $credit = $this->balances->allSnapshots($mess)[0]->totals()[$member->id] ?? 0;
            if ($amountPaisa > $credit) {
                throw new LifecycleException(__('That is more than this member is owed.'), 'exceeds_credit', ['credit_paisa' => max(0, $credit)]);
            }
            $cash = CashPool::balance($mess);
            if ($amountPaisa > $cash) {
                throw new LifecycleException(__('The cash pool does not have that much.'), 'exceeds_cash', ['cash_paisa' => max(0, $cash)]);
            }

            $month = $this->calendar->assignMonth($mess, $paidOn)['month'];
            $entry = LedgerEntry::create([
                'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $member->id, 'group' => 'fixed',
                'type' => LedgerType::FinalPayout, 'amount_paisa' => -$amountPaisa, 'note' => 'Final payout',
                'meta' => ['paid_on' => $paidOn], 'created_by_member_id' => $by->id,
                'created_at' => Carbon::now(), // microseconds: reopen compares against closed_at
            ]);
            $this->audit->log('payout.final', $entry, [], ['member_id' => $member->id, 'amount_paisa' => $amountPaisa], ['paid_on' => $paidOn]);

            return [
                'id' => $entry->id, 'member_id' => $member->id, 'month_id' => $month->id, 'amount_paisa' => $amountPaisa,
                'paid_on' => $paidOn, 'credit_after_paisa' => $credit - $amountPaisa, 'cash_pool_paisa' => $cash - $amountPaisa,
            ];
        });
    }
}
