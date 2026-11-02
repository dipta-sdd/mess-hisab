<?php

use App\Services\Balance\MonthBalanceService;

require_once __DIR__.'/../Balance/BalanceHelpers.php';

/** Rent 3000 (equal) + bazar meals; shared cash set by a payment so the close identity holds. */
function kScenario(string $role = 'manager'): array
{
    [$mess, $me, $month, $ids] = jSetup($role, 3);
    jToday('2026-11-20');
    $rent = jCategory($mess, ['name' => 'Rent', 'split_type' => 'equal', 'sort' => 1]);
    $bazar = jCategory($mess, ['name' => 'Bazar', 'group' => 'meals', 'split_type' => 'by_meal', 'sort' => 2]);
    jBill($mess, $month, $rent, 300000);
    jExpense($mess, $month, $bazar, 90000, $ids[0]);
    jMeals($mess, $month, $ids[0], 2000);
    jMeals($mess, $month, $ids[1], 1000);
    jMeals($mess, $month, $ids[2], 0);

    return [$mess, $me, $month, $ids];
}

function kBalances(int $messId): array
{
    return app(MonthBalanceService::class)->allSnapshots(\App\Models\Mess::findOrFail($messId))[0]->totals();
}
