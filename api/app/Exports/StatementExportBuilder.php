<?php

namespace App\Exports;

use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;

/** Member statement workbook: the same lines the Statement endpoint returns (BalanceViews::statement). */
class StatementExportBuilder
{
    public function __construct(private readonly MonthBalanceService $balances) {}

    public function build(Mess $mess, Month $month, MessMember $member): ExportWorkbook
    {
        $s = BalanceViews::statement($this->balances->snapshot($month), $member);

        $rows = [
            ['Mess', $mess->name],
            ['Member', $s['member']['display_name']],
            ['Month', $s['month']['starts_on'].' to '.$s['month']['ends_on']],
            ['Status', $s['month']['status']],
            ['As of', $s['today']],
            [],
            ['Date', 'Kind', 'Group', 'Description', 'Amount (BDT)'],
        ];
        foreach ($s['lines'] as $l) {
            $rows[] = [(string) $l['date'], $l['kind'], (string) $l['group'], $l['label'], Money::taka($l['amount_paisa'])];
        }
        $rows[] = [];
        $rows[] = ['', '', '', 'Fixed balance (BDT)', Money::taka($s['fixed_balance_paisa'])];
        $rows[] = ['', '', '', 'Meals balance (BDT)', Money::taka($s['meals_balance_paisa'])];
        $rows[] = ['', '', '', 'Total (BDT)', Money::taka($s['total_paisa'])];
        $rows[] = ['', '', '', 'Fixed outstanding (BDT)', Money::taka($s['fixed_outstanding_paisa'])];
        $rows[] = ['', '', '', 'Deposit required (BDT)', Money::taka($s['deposit_required_paisa'])];
        $rows[] = ['', '', '', 'Deposit outstanding (BDT)', Money::taka($s['deposit_outstanding_paisa'])];
        $rows[] = ['', '', '', 'Fixed overdue days', $s['fixed_overdue_days']];
        $rows[] = ['', '', '', 'Deposit overdue days', $s['deposit_overdue_days']];

        return new ExportWorkbook([new ArraySheet('Statement', $rows)]);
    }
}
