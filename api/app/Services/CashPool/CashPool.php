<?php

namespace App\Services\CashPool;

use App\Enums\ExpenseStatus;
use App\Enums\LedgerType;
use App\Enums\PaidBy;
use App\Models\Expense;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\Payment;
use App\Models\RecoverableRepayment;

/**
 * CONTRACT §3: cash = Σ payments + Σ recoverable_repayments − Σ approved cash expenses − Σ |final_payout|.
 * Pure read, computed from raw rows (soft-deleted rows excluded). One pool per mess;
 * it follows the manager role. Not clamped: callers (expenses) keep it from going negative.
 */
class CashPool
{
    public static function balance(Mess $mess): int
    {
        $split = self::breakdown($mess);

        return $split['fixed'] + $split['meals'];
    }

    /**
     * The pool split by group: payments by their group, cash expenses by their category's group;
     * repayments and final payouts are fixed-group. Sums to balance().
     *
     * @return array{fixed:int,meals:int}
     */
    public static function breakdown(Mess $mess): array
    {
        $id = $mess->id;
        $split = ['fixed' => 0, 'meals' => 0];

        foreach (Payment::query()->forMess($id)->selectRaw('"group" as g, SUM(amount_paisa) as s')->groupBy('group')->get() as $row) {
            $split[$row->g === 'meals' ? 'meals' : 'fixed'] += (int) $row->s;
        }
        $split['fixed'] += (int) RecoverableRepayment::query()->forMess($id)->sum('amount_paisa')
            - abs((int) LedgerEntry::query()->forMess($id)->where('type', LedgerType::FinalPayout->value)->sum('amount_paisa'));

        $expenses = Expense::query()->forMess($id)
            ->where('paid_by', PaidBy::Cash->value)
            ->where('status', ExpenseStatus::Approved->value)
            ->join('categories', 'categories.id', '=', 'expenses.category_id')
            ->selectRaw('categories."group" as g, SUM(expenses.amount_paisa) as s')
            ->groupBy('categories.group')->get();
        foreach ($expenses as $row) {
            $split[$row->g === 'meals' ? 'meals' : 'fixed'] -= (int) $row->s;
        }

        return $split;
    }
}
