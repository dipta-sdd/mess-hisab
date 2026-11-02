<?php

use App\Billing\Charges\ChargeCalculator;
use App\Billing\Dto\BillInput;
use App\Billing\Dto\ChargeInput;
use App\Billing\Dto\MealInput;
use App\Enums\Group;
use App\Enums\RoundingMode;
use App\Enums\SplitType;
use App\Enums\ZeroMealResolution;

require_once __DIR__.'/GateHelpers.php';

function example1Meals(): MealInput
{
    // PROJECT §7 example 1: food 8,000; meals 60/50/40/10, minimum 20.
    return new MealInput(
        costPaisa: 800000,
        memberIds: [1, 2, 3, 4],
        mealsCenti: [1 => 6000, 2 => 5000, 3 => 4000, 4 => 1000],
        minMealsCenti: [1 => 2000, 2 => 2000, 3 => 2000, 4 => 2000],
        minPayablePaisa: null,
        zeroMealResolution: null,
    );
}

it('charges PROJECT §7 example 1 in two-decimal mode', function () {
    $r = ChargeCalculator::calculate(new ChargeInput(1, [1, 2, 3, 4], RoundingMode::TwoDecimals, [], example1Meals()));

    expect($r->meal->effectiveMealsCenti)->toBe([1 => 6000, 2 => 5000, 3 => 4000, 4 => 2000])
        ->and($r->meal->totalEffectiveMealsCenti)->toBe(17000)
        ->and($r->charged['meals'])->toBe([1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118])
        ->and($r->charged['fixed'])->toBe([1 => 0, 2 => 0, 3 => 0, 4 => 0])
        ->and($r->totalRoundingDeltaPaisa)->toBe(0)
        ->and($r->unchargedFoodPaisa)->toBe(0);
});

it('charges PROJECT §7 example 1 in whole-taka mode as 2824/2353/1882/941', function () {
    $r = ChargeCalculator::calculate(new ChargeInput(1, [1, 2, 3, 4], RoundingMode::WholeTaka, [], example1Meals()));

    expect($r->exact['meals'])->toBe([1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118])
        ->and($r->charged['meals'])->toBe([1 => 282400, 2 => 235300, 3 => 188200, 4 => 94100])
        ->and($r->rounding['meals']->delta)->toBe([1 => 47, 2 => 6, 3 => -35, 4 => -18])
        ->and($r->totalRoundingDeltaPaisa)->toBe(0);
});

it('charges the PROJECT §5 minimum-meals example (Nilu 952 in whole taka)', function () {
    $meals = new MealInput(1000000, [1, 2, 3], [1 => 10000, 2 => 9000, 3 => 1000], [1 => 2000, 2 => 2000, 3 => 2000], null, null);

    $exact = ChargeCalculator::calculate(new ChargeInput(1, [1, 2, 3], RoundingMode::TwoDecimals, [], $meals));
    $taka = ChargeCalculator::calculate(new ChargeInput(1, [1, 2, 3], RoundingMode::WholeTaka, [], $meals));

    expect($exact->charged['meals'])->toBe([1 => 476191, 2 => 428571, 3 => 95238])
        ->and($taka->charged['meals'])->toBe([1 => 476200, 2 => 428600, 3 => 95200]);
});

it('applies minimum payable after minimum meals and takes the surplus off the others', function () {
    $meals = new MealInput(300000, [1, 2, 3], [1 => 10000, 2 => 10000, 3 => 1000], [1 => null, 2 => null, 3 => null], 50000, null);

    $r = ChargeCalculator::calculate(new ChargeInput(1, [1, 2, 3], RoundingMode::TwoDecimals, [], $meals));

    expect($r->charged['meals'])->toBe([1 => 125000, 2 => 125000, 3 => 50000]);
});

it('charges PROJECT §7 example 2 fixed and meals bills', function () {
    $ids = [1, 2, 3]; // X, Y, Z
    $bills = [
        new BillInput(10, Group::Fixed, SplitType::FixedPerPerson, 750000, $ids, [1 => 200000, 2 => 350000, 3 => 200000]), // rent
        new BillInput(11, Group::Fixed, SplitType::Equal, 90000, $ids, []), // wifi
    ];
    $meals = new MealInput(200000, $ids, [1 => 2000, 2 => 1000, 3 => 2000], [1 => null, 2 => null, 3 => null], null, null);

    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::WholeTaka, $bills, $meals));

    expect($r->bills[10]->shares)->toBe([1 => 200000, 2 => 350000, 3 => 200000])
        ->and($r->bills[10]->unallocatedPaisa)->toBe(0)
        ->and($r->bills[11]->shares)->toBe([1 => 30000, 2 => 30000, 3 => 30000])
        ->and($r->charged['fixed'])->toBe([1 => 230000, 2 => 380000, 3 => 230000])
        ->and($r->charged['meals'])->toBe([1 => 80000, 2 => 40000, 3 => 80000])
        ->and($r->meal->displayRatePaisa)->toBe(4000);
});

it('splits the Excel October bazar equally as a meals bill (meal tracking off)', function () {
    $ids = [1, 2, 3]; // Shuvendu, Dipta, Nilu
    $bills = [new BillInput(20, Group::Meals, SplitType::Equal, 1458200, $ids, [])];

    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, $bills, gateNoMeals($ids)));

    expect($r->charged['meals'])->toBe([1 => 486067, 2 => 486067, 3 => 486066]);
});

it('rounds each member total up in round-up mode and reports the extra', function () {
    $ids = [1, 2, 3];
    $bills = [new BillInput(10, Group::Fixed, SplitType::Equal, 156345, $ids, [])]; // 521.15 each

    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::RoundUp, $bills, gateNoMeals($ids)));

    expect($r->exact['fixed'])->toBe([1 => 52115, 2 => 52115, 3 => 52115])
        ->and($r->charged['fixed'])->toBe([1 => 52200, 2 => 52200, 3 => 52200])
        ->and($r->totalRoundingDeltaPaisa)->toBe(255);
});

it('pins an override and splits the rest of an equal bill among the others', function () {
    $ids = [1, 2, 3];
    $bills = [new BillInput(11, Group::Fixed, SplitType::Equal, 90000, $ids, [3 => 10000])];

    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, $bills, gateNoMeals($ids)));

    expect($r->bills[11]->shares)->toBe([1 => 40000, 2 => 40000, 3 => 10000])
        ->and($r->totalUnallocatedPaisa)->toBe(0);
});

it('reports unallocated when per-person amounts do not add up', function () {
    $ids = [1, 2, 3];
    $bills = [new BillInput(10, Group::Fixed, SplitType::FixedPerPerson, 800000, $ids, [1 => 200000, 2 => 350000, 3 => 200000])];

    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, $bills, gateNoMeals($ids)));

    expect($r->bills[10]->unallocatedPaisa)->toBe(50000)
        ->and($r->totalUnallocatedPaisa)->toBe(50000);
});

it('blocks zero meals until resolved, then splits equally or carries', function () {
    $ids = [1, 2, 3];
    $make = fn (?ZeroMealResolution $res) => new MealInput(100000, $ids, array_fill_keys($ids, 0), array_fill_keys($ids, null), null, $res);

    $unresolved = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, [], $make(null)));
    $equal = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, [], $make(ZeroMealResolution::SplitEqual)));
    $carry = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, [], $make(ZeroMealResolution::Carry)));

    expect($unresolved->meal->zeroMealsUnresolved)->toBeTrue()
        ->and($unresolved->charged['meals'])->toBe([1 => 0, 2 => 0, 3 => 0])
        ->and($unresolved->unchargedFoodPaisa)->toBe(100000)
        ->and($equal->charged['meals'])->toBe([1 => 33334, 2 => 33333, 3 => 33333])
        ->and($equal->unchargedFoodPaisa)->toBe(0)
        ->and($carry->meal->carryOutPaisa)->toBe(100000)
        ->and($carry->unchargedFoodPaisa)->toBe(100000)
        ->and($carry->charged['meals'])->toBe([1 => 0, 2 => 0, 3 => 0]);
});
