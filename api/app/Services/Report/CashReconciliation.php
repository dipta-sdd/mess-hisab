<?php

namespace App\Services\Report;

use App\Enums\ExpenseStatus;
use App\Enums\Group;
use App\Models\Category;
use App\Models\Expense;
use App\Models\Mess;
use App\Models\Month;
use App\Models\MonthBill;
use App\Services\Balance\MonthSnapshot;
use App\Services\CashPool\CashPool;

/**
 * Cash in the manager's hand at the end of a month, and why it is that much. Reads only; the close-check identity
 * (cash - Σbalances = unpaid fixed bills + rounding + ...) is what makes the lines add up.
 *
 *   cash = owed to members - owed by members + fixed bills charged but not paid out + other
 *
 * `extra` is cash that no member's balance covers (it is what the manager may share out equally, never more than the cash).
 */
class CashReconciliation
{
    /** @return array<string,int> */
    public function forMonth(Mess $mess, Month $month, MonthSnapshot $snap): array
    {
        $ids = Month::query()->forMess($mess->id)->where('starts_on', '<=', $month->starts_on->toDateString())->pluck('id')->all();
        $split = CashPool::breakdown($mess, $ids);
        $cash = $split['fixed'] + $split['meals'];

        $totals = $snap->totals();
        $owed = array_sum(array_filter($totals, fn (int $v) => $v > 0));
        $due = -array_sum(array_filter($totals, fn (int $v) => $v < 0));

        $fixedCategoryIds = Category::query()->forMess($mess->id)->where('group', Group::Fixed->value)->pluck('id');
        $fixedBills = (int) MonthBill::query()->forMess($mess->id)->whereIn('month_id', $ids)->whereIn('category_id', $fixedCategoryIds)->sum('amount_paisa');
        $fixedSpent = (int) Expense::query()->forMess($mess->id)->whereIn('month_id', $ids)->where('status', ExpenseStatus::Approved->value)
            ->whereIn('category_id', $fixedCategoryIds)->sum('amount_paisa');
        $unpaidBills = max(0, $fixedBills - $fixedSpent);

        $sum = $owed - $due;
        $other = $cash - $sum - $unpaidBills;

        return [
            'in_hand_paisa' => $cash,
            'in_hand_fixed_paisa' => $split['fixed'],
            'in_hand_meals_paisa' => $split['meals'],
            'owed_to_members_paisa' => $owed,
            'owed_by_members_paisa' => $due,
            'unpaid_fixed_bills_paisa' => $unpaidBills,
            'other_paisa' => $other,
            // Cash no balance covers. Includes charged-but-unpaid bills: the manager decides what is really spare.
            'extra_paisa' => max(0, min($cash, $cash - $sum)),
        ];
    }
}
