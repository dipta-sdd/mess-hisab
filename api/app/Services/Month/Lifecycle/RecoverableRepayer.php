<?php

namespace App\Services\Month\Lifecycle;

use App\Billing\DoesntPay\RepaymentAllocator;
use App\Enums\LedgerType;
use App\Enums\RecoverableStatus;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Recoverable;
use App\Models\RecoverableRepayment;
use App\Models\RecoverableShare;
use App\Services\Audit\AuditLogger;
use App\Services\Month\Calendar;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Task K: a debtor pays back (part of) an unpaid share. The money enters the cash pool and is credited
 * to the members who absorbed it, by RepaymentAllocator (largest remainder, lowest member id wins a
 * tie), weighted by what each member is still owed of their saved share. Archived members are credited too.
 */
class RecoverableRepayer
{
    public function __construct(private readonly Calendar $calendar, private readonly AuditLogger $audit) {}

    public function repay(Mess $mess, Recoverable $requested, int $amountPaisa, string $paidOn, MessMember $by): RecoverableRepayment
    {
        return DB::transaction(function () use ($mess, $requested, $amountPaisa, $paidOn, $by) {
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail();
            $recoverable = Recoverable::query()->forMess($mess->id)->whereKey($requested->id)->lockForUpdate()->firstOrFail();

            if ($recoverable->status !== RecoverableStatus::Open) {
                throw new LifecycleException('Only an unpaid share that is open can be repaid.', 'recoverable_not_open');
            }
            $outstanding = (int) $recoverable->amount_paisa - (int) $recoverable->repaid_paisa;
            if ($amountPaisa > $outstanding) {
                throw new LifecycleException('That is more than is still owed.', 'exceeds_outstanding', ['outstanding_paisa' => $outstanding]);
            }

            $month = $this->calendar->assignMonth($mess, $paidOn)['month'];

            $repayment = RecoverableRepayment::create([
                'mess_id' => $mess->id, 'recoverable_id' => $recoverable->id, 'month_id' => $month->id,
                'amount_paisa' => $amountPaisa, 'paid_on' => $paidOn, 'created_by_member_id' => $by->id,
            ]);

            // What each member is still owed of the saved share = share - credits so far.
            $credited = LedgerEntry::query()->forMess($mess->id)->where('type', LedgerType::RecoverableRepay->value)
                ->where('source_type', 'recoverable_repayment')
                ->whereIn('source_id', RecoverableRepayment::query()->forMess($mess->id)
                    ->where('recoverable_id', $recoverable->id)->where('id', '!=', $repayment->id)->select('id'))
                ->groupBy('member_id')->selectRaw('member_id as m, SUM(amount_paisa) as s')->pluck('s', 'm');
            $weights = [];
            foreach (RecoverableShare::query()->forMess($mess->id)->where('recoverable_id', $recoverable->id)->orderBy('member_id')->get() as $share) {
                $weights[(int) $share->member_id] = max(0, (int) $share->amount_paisa - (int) ($credited[$share->member_id] ?? 0));
            }

            $debtor = MessMember::query()->forMess($mess->id)->find($recoverable->debtor_member_id)?->display_name ?? 'a member';
            $now = Carbon::now();
            foreach (RepaymentAllocator::allocate($amountPaisa, $weights) as $memberId => $credit) {
                if ($credit === 0) {
                    continue;
                }
                LedgerEntry::create([
                    'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $memberId, 'group' => 'fixed',
                    'type' => LedgerType::RecoverableRepay, 'amount_paisa' => $credit, 'note' => "Repayment from {$debtor}",
                    'source_type' => 'recoverable_repayment', 'source_id' => $repayment->id,
                    'meta' => ['recoverable_id' => $recoverable->id, 'paid_on' => $paidOn],
                    'created_by_member_id' => $by->id, 'created_at' => $now,
                ]);
            }

            $repaid = (int) $recoverable->repaid_paisa + $amountPaisa;
            $recoverable->forceFill([
                'repaid_paisa' => $repaid,
                'status' => $repaid === (int) $recoverable->amount_paisa ? RecoverableStatus::Settled : RecoverableStatus::Open,
            ])->save();

            return $repayment;
        });
    }
}
