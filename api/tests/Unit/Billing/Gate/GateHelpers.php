<?php

/*
| Gate tests — lead-owned, READ-ONLY for engine agents (CONTRACT §5).
| They use only the top-level engine classes and the frozen DTOs.
| Member ids are chosen so ascending id order = the tie-break order the
| expected values assume (e.g. Excel October: S=1 < D=2 < N=3).
*/

use App\Billing\Dto\BalanceInput;
use App\Billing\Dto\MealInput;

function gateNoMeals(array $memberIds): MealInput
{
    return new MealInput(
        costPaisa: 0,
        memberIds: $memberIds,
        mealsCenti: array_fill_keys($memberIds, 0),
        minMealsCenti: array_fill_keys($memberIds, null),
        minPayablePaisa: null,
        zeroMealResolution: null,
    );
}

/** Group map with zeros for everyone, overlaid with the given values. */
function gateGroups(array $memberIds, array $fixed = [], array $meals = []): array
{
    $zero = array_fill_keys($memberIds, 0);

    return ['fixed' => array_replace($zero, $fixed), 'meals' => array_replace($zero, $meals)];
}

function gateBalanceInput(array $memberIds, array $overrides = []): BalanceInput
{
    $zero = array_fill_keys($memberIds, 0);
    $args = array_replace([
        'memberIds' => $memberIds,
        'activeMemberIds' => $memberIds,
        'carryIn' => $zero,
        'payments' => gateGroups($memberIds),
        'ownPocket' => gateGroups($memberIds),
        'ledger' => gateGroups($memberIds),
        'charges' => gateGroups($memberIds),
        'mealWeights' => $zero,
        'doesntPay' => [],
        'depositRequired' => $zero,
        'fixedDeadline' => null,
        'depositDeadline' => null,
        'today' => '2026-11-02',
    ], $overrides);

    return new BalanceInput(...$args);
}
