<?php

namespace App\Services\Report;

use App\Enums\ExpenseStatus;
use App\Enums\Group;
use App\Enums\MealTracking;
use App\Enums\MonthStatus;
use App\Http\Resources\MessResource;
use App\Http\Resources\MonthResource;
use App\Models\Expense;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use App\Services\Setup\BillSetup;

/**
 * Task R: the monthly report of a CLOSED month, plus what everyone pays for the following month.
 * Read-only apart from Calendar's lazy creation of the next month. No balance math lives here: shares, paid and
 * balances come from BalanceViews (MonthBalanceService), the next month's Fixed shares from BillSetup, and
 * "last month due" is exactly the carry-in the next month's dashboard / Fixed page shows.
 */
class MonthlyReport
{
    public function __construct(
        private readonly MonthBalanceService $balances,
        private readonly BillSetup $bills,
        private readonly Calendar $calendar,
    ) {}

    /** @throws ReportException */
    public function build(Mess $mess, Month $month): array
    {
        if ($month->status !== MonthStatus::Closed) {
            throw new ReportException(__('The monthly report is available once the month is closed.'), 'month_not_closed');
        }

        $next = $this->nextMonth($mess, $month);
        $billViews = array_values(array_filter(
            $this->bills->billsFor($next),
            fn (array $b) => $b['group'] === Group::Fixed->value && $b['amount_paisa'] > 0,
        ));
        if ($billViews === []) {
            throw new ReportException(__('Set up next month\'s Fixed bills first.'), 'next_month_bills_missing', ['next_month_id' => $next->id]);
        }

        $snap = $this->balances->snapshot($month);
        $dash = BalanceViews::dashboard($snap, 0, $mess->manager_member_id);
        $history = BalanceViews::historyRow($snap);
        $totals = $dash['totals'];
        $active = array_values(array_filter($dash['members'], fn (array $r) => $r['is_active']));

        $spent = $snap->ownPocket->groupBy('paid_by_member_id')->map(fn ($es) => (int) $es->sum('amount_paisa'));
        $members = array_map(fn (array $r) => [
            'member_id' => $r['member_id'],
            'display_name' => $r['display_name'],
            'carry_in_paisa' => $r['carry_in_paisa'],
            'fixed_bill_paisa' => $r['fixed_bill_paisa'],
            'meals_bill_paisa' => $r['meals_bill_paisa'],
            'share_paisa' => $r['fixed_bill_paisa'] + $r['meals_bill_paisa'],
            'paid_paisa' => $r['paid_paisa'],
            'spent_paisa' => $spent[$r['member_id']] ?? 0,
            'balance_paisa' => $r['balance_paisa'],
        ], $active);

        $expenses = Expense::query()->with(['category', 'paidByMember'])
            ->where('month_id', $month->id)->where('status', ExpenseStatus::Approved->value)
            ->orderBy('spent_on')->orderBy('id')->get()
            ->map(fn (Expense $e) => [
                'id' => $e->id,
                'spent_on' => $e->spent_on->toDateString(),
                'category_id' => $e->category_id,
                'category' => $e->category?->name,
                'group' => $e->category?->group->value,
                'amount_paisa' => $e->amount_paisa,
                'paid_by' => $e->paid_by->value,
                'paid_by_member_id' => $e->paid_by_member_id,
                'payer_name' => $e->paidByMember?->display_name,
                'note' => $e->note,
            ])->all();

        return [
            'month' => (new MonthResource($month))->resolve(),
            'mess' => (new MessResource($mess))->resolve(),
            'summary' => [
                'member_count' => count($members),
                'expense_count' => count($expenses),
                'expenses_paisa' => $history['expenses_paisa'],
                'fixed_expenses_paisa' => $totals['fixed_expenses_paisa'],
                'meals_expenses_paisa' => $totals['meals_expenses_paisa'],
                'fixed_bills_paisa' => $totals['fixed_bills_paisa'],
                'fixed_charged_paisa' => $history['fixed_charged_paisa'],
                'meals_charged_paisa' => $history['meals_charged_paisa'],
                'charged_paisa' => $totals['charged_paisa'],
                'paid_paisa' => $totals['paid_paisa'],
                'spent_paisa' => (int) $snap->ownPocket->sum('amount_paisa'),
                'total_due_paisa' => $history['total_due_paisa'],
                'total_credit_paisa' => $history['total_credit_paisa'],
                'rounding_extra_paisa' => $totals['rounding_extra_paisa'],
            ],
            'members' => $members,
            'expenses' => $expenses,
            'meals' => $this->meals($mess, $dash, $active),
            'next_month' => $this->nextMonthBlock($next, $billViews),
        ];
    }

    /** @return array<string,mixed>|null */
    private function meals(Mess $mess, array $dash, array $active): ?array
    {
        if ($mess->meal_tracking === MealTracking::Off) {
            return null;
        }

        return [
            'total_meals_centi' => $dash['totals']['total_meals_centi'],
            'meal_rate_paisa' => $dash['totals']['meal_rate_paisa'],
            'food_cost_paisa' => $dash['totals']['food_cost_paisa'],
            'members' => array_map(fn (array $r) => [
                'member_id' => $r['member_id'],
                'display_name' => $r['display_name'],
                'meals_centi' => $r['meals_centi'],
                'effective_meals_centi' => $r['effective_meals_centi'],
                'meals_bill_paisa' => $r['meals_bill_paisa'],
            ], $active),
        ];
    }

    /**
     * @param  list<array>  $billViews  next month's Fixed bills (BillSetup views) with an amount
     * @return array<string,mixed>
     */
    private function nextMonthBlock(Month $next, array $billViews): array
    {
        $nextSnap = $this->balances->snapshot($next);
        $names = $nextSnap->categories;
        $ids = array_values(array_unique(array_merge(
            $nextSnap->activeMemberIds,
            array_keys(array_filter($nextSnap->carryIn, fn (int $v) => $v < 0)),
        )));
        sort($ids);

        $rows = [];
        foreach ($ids as $id) {
            $byCategory = [];
            $cats = 0;
            foreach ($billViews as $bill) {
                $amount = (int) ($bill['shares'][$id] ?? 0);
                $cats += $amount;
                $byCategory[] = [
                    'category_id' => $bill['category_id'],
                    'name' => $names->get($bill['category_id'])?->name ?? '',
                    'split_type' => $bill['split_type'],
                    'amount_paisa' => $amount,
                ];
            }
            // The same figure the next month's dashboard / statement shows as "Last month due".
            $carry = $nextSnap->balances->members[$id]->fixed->carryInPaisa;
            $due = max(0, -$carry);
            $credit = max(0, $carry);

            $rows[] = [
                'member_id' => $id,
                'display_name' => $nextSnap->members->get($id)?->display_name ?? '',
                'by_category' => $byCategory,
                'last_month_due_paisa' => $due,
                'last_month_credit_paisa' => $credit,
                'total_paisa' => max(0, $cats + $due - $credit),
            ];
        }

        return [
            'month' => (new MonthResource($next))->resolve(),
            'fixed_deadline' => $next->fixed_deadline?->toDateString(),
            'rows' => $rows,
        ];
    }

    private function nextMonth(Mess $mess, Month $month): Month
    {
        $start = $month->ends_on->copy()->addDay()->toDateString();
        $next = Month::query()->forMess($mess->id)->whereDate('starts_on', $start)->first();
        if ($next !== null) {
            return $next;
        }
        try {
            return $this->calendar->monthFor($mess, $start);
        } catch (CalendarException) {
            throw new ReportException(__('Next month does not exist yet.'), 'next_month_bills_missing', ['next_month_id' => null]);
        }
    }
}
