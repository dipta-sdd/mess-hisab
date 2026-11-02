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
        $id = $mess->id;

        $in = (int) Payment::query()->forMess($id)->sum('amount_paisa')
            + (int) RecoverableRepayment::query()->forMess($id)->sum('amount_paisa');

        $out = (int) Expense::query()->forMess($id)
            ->where('paid_by', PaidBy::Cash->value)
            ->where('status', ExpenseStatus::Approved->value)
            ->sum('amount_paisa')
            + abs((int) LedgerEntry::query()->forMess($id)
                ->where('type', LedgerType::FinalPayout->value)
                ->sum('amount_paisa'));

        return $in - $out;
    }
}
