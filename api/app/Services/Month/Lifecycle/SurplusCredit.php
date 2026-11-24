<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Balance\MonthSnapshot;
use App\Services\Report\CashReconciliation;
use Illuminate\Support\Carbon;

/**
 * The manager may share the cash no balance covers equally among the members who were active in the month, as extra
 * credit toward the next month. Stored as plain `adjustment` ledger rows in the closing month (source `month_close`,
 * so reopening deletes them), which the close-check identity already counts. A rounding crumb goes to the manager.
 */
class SurplusCredit
{
    public function __construct(private readonly CashReconciliation $cash) {}

    /** The most the manager may share out now (0 when cash is fully covered by balances). */
    public function available(Mess $mess, Month $month, MonthSnapshot $snap): int
    {
        return $this->cash->forMonth($mess, $month, $snap)['extra_paisa'];
    }

    /**
     * Equal shares per active member; the crumb that does not divide goes to the manager.
     *
     * @return array<int,int> member id => paisa
     */
    public function split(Mess $mess, Month $month, int $amountPaisa): array
    {
        $ids = MessMember::query()->where('mess_id', $mess->id)->activeIn($month)->orderBy('id')->pluck('id')->all();
        if ($amountPaisa <= 0 || $ids === []) {
            return [];
        }
        $each = intdiv($amountPaisa, count($ids));
        $crumb = $amountPaisa - $each * count($ids);
        $keeper = in_array($mess->manager_member_id, $ids, true) ? $mess->manager_member_id : $ids[0];

        $out = [];
        foreach ($ids as $id) {
            $out[$id] = $each + ($id === $keeper ? $crumb : 0);
        }

        return array_filter($out, fn (int $v) => $v > 0);
    }

    /**
     * Writes the shares. Caller holds the transaction.
     *
     * @throws LifecycleException when the amount is more than what is spare
     */
    public function write(Mess $mess, Month $month, MonthSnapshot $snap, int $amountPaisa, MessMember $by): array
    {
        if ($amountPaisa <= 0) {
            return [];
        }
        $available = $this->available($mess, $month, $snap);
        if ($amountPaisa > $available) {
            throw new LifecycleException(__('That is more than the spare cash.'), 'exceeds_surplus', ['available_paisa' => $available]);
        }
        $shares = $this->split($mess, $month, $amountPaisa);
        $now = Carbon::now();
        foreach ($shares as $memberId => $share) {
            LedgerEntry::create([
                'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $memberId, 'group' => 'fixed',
                'type' => LedgerType::Adjustment, 'amount_paisa' => $share, 'note' => 'Spare cash shared equally',
                'source_type' => MonthCloser::SOURCE, 'source_id' => $month->id,
                'created_by_member_id' => $by->id, 'created_at' => $now,
            ]);
        }

        return $shares;
    }
}
