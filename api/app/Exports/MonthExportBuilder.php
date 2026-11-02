<?php

namespace App\Exports;

use App\Enums\PaidBy;
use App\Models\Expense;
use App\Models\MealEntry;
use App\Models\Mess;
use App\Models\Month;
use App\Models\Payment;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use App\Services\CashPool\CashPool;

/**
 * Month workbook: Summary, Members, Expenses, Meals, Payments. Every balance figure comes from
 * BalanceViews::dashboard (the same array the dashboard endpoint returns); nothing is recomputed here.
 * All queries use explicit mess ids: this runs in a queue worker with no MessContext.
 */
class MonthExportBuilder
{
    public function __construct(private readonly MonthBalanceService $balances) {}

    public function build(Mess $mess, Month $month): ExportWorkbook
    {
        $snapshot = $this->balances->snapshot($month);
        $d = BalanceViews::dashboard($snapshot, CashPool::balance($mess), $mess->manager_member_id);
        $names = $snapshot->members->map(fn ($m) => $m->display_name);
        $t = $d['totals'];
        $m = $d['month'];

        $summary = [
            ['Mess', $mess->name],
            ['Month', $m['starts_on'].' to '.$m['ends_on']],
            ['Status', $m['status']],
            ['As of', $d['today']],
            ['Fixed deadline', (string) $m['fixed_deadline']],
            ['Deposit deadline', (string) $m['deposit_deadline']],
            [],
            ['Fixed bills (BDT)', Money::taka($t['fixed_bills_paisa'])],
            ['Fixed expenses (BDT)', Money::taka($t['fixed_expenses_paisa'])],
            ['Meals expenses (BDT)', Money::taka($t['meals_expenses_paisa'])],
            ['Food cost (BDT)', Money::taka($t['food_cost_paisa'])],
            ['Total meals', Money::meals($t['total_meals_centi'])],
            ['Meal rate (BDT)', Money::taka($t['meal_rate_paisa'])],
            ['Rounding extra (BDT)', Money::taka($t['rounding_extra_paisa'])],
            ['Uncharged food (BDT)', Money::taka($t['uncharged_food_paisa'])],
            ['Total charged (BDT)', Money::taka($t['charged_paisa'])],
            ['Total paid (BDT)', Money::taka($t['paid_paisa'])],
            ['Cash pool (BDT)', Money::taka($d['cash_pool_paisa'])],
            ['Manager balance (BDT)', Money::taka($d['manager_balance_paisa'])],
        ];

        $members = [['Member', 'Meals', 'Carry in (BDT)', 'Fixed bill (BDT)', 'Meals bill (BDT)', 'Paid (BDT)',
            'Fixed balance (BDT)', 'Meals balance (BDT)', 'Balance (BDT)', 'Fixed outstanding (BDT)',
            'Deposit required (BDT)', 'Deposit outstanding (BDT)', 'Fixed overdue days', 'Deposit overdue days']];
        foreach ($d['members'] as $r) {
            $members[] = [
                $r['display_name'], Money::meals($r['meals_centi']), Money::taka($r['carry_in_paisa']),
                Money::taka($r['fixed_bill_paisa']), Money::taka($r['meals_bill_paisa']), Money::taka($r['paid_paisa']),
                Money::taka($r['fixed_balance_paisa']), Money::taka($r['meals_balance_paisa']), Money::taka($r['balance_paisa']),
                Money::taka($r['fixed_outstanding_paisa']), Money::taka($r['deposit_required_paisa']),
                Money::taka($r['deposit_outstanding_paisa']), (string) $r['fixed_overdue_days'], (string) $r['deposit_overdue_days'],
            ];
        }

        $expenses = [['Date', 'Category', 'Group', 'Amount (BDT)', 'Paid by', 'Member', 'Status', 'Note']];
        foreach (Expense::query()->forMess($mess->id)->where('month_id', $month->id)->orderBy('spent_on')->orderBy('id')->get() as $e) {
            $cat = $snapshot->categories->get($e->category_id);
            $expenses[] = [
                $e->spent_on->toDateString(), $cat?->name ?? '', $cat?->group->value ?? '', Money::taka($e->amount_paisa),
                $e->paid_by === PaidBy::Member ? 'member' : 'cash', $names->get($e->paid_by_member_id, ''), $e->status->value, (string) $e->note,
            ];
        }

        $meals = [['Date', 'Member', 'Breakfast', 'Lunch', 'Dinner', 'Meals', 'Guest meals']];
        foreach (MealEntry::query()->forMess($mess->id)->where('month_id', $month->id)->orderBy('entry_date')->orderBy('member_id')->get() as $e) {
            $meals[] = [
                $e->entry_date->toDateString(), $names->get($e->member_id, ''), (string) $e->breakfast, (string) $e->lunch,
                (string) $e->dinner, Money::meals($e->meals_centi), Money::meals($e->guest_meals_centi),
            ];
        }

        $payments = [['Date', 'Member', 'Group', 'Amount (BDT)', 'Received by', 'Note']];
        foreach (Payment::query()->forMess($mess->id)->where('month_id', $month->id)->orderBy('paid_on')->orderBy('id')->get() as $p) {
            $payments[] = [
                $p->paid_on->toDateString(), $names->get($p->member_id, ''), $p->group->value, Money::taka($p->amount_paisa),
                $names->get($p->received_by_member_id, ''), (string) $p->note,
            ];
        }

        return new ExportWorkbook([
            new ArraySheet('Summary', $summary),
            new ArraySheet('Members', $members),
            new ArraySheet('Expenses', $expenses),
            new ArraySheet('Meals', $meals),
            new ArraySheet('Payments', $payments),
        ]);
    }
}
