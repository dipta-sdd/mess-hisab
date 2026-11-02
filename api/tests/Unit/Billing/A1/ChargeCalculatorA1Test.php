<?php

use App\Billing\Charges\ChargeCalculator;
use App\Billing\Dto\BillInput;
use App\Billing\Dto\ChargeInput;
use App\Billing\Dto\MealInput;
use App\Enums\Group;
use App\Enums\RoundingMode;
use App\Enums\SplitType;

function a1NoMeals(array $ids): MealInput
{
    return new MealInput(0, $ids, array_fill_keys($ids, 0), array_fill_keys($ids, null), null, null);
}

it('rounds each group total once, never per category', function () {
    $ids = [1, 2];
    // two fixed bills each 50 paisa/person-ish: rounding per category would give 0+0; per group total 100 -> 1 taka
    $bills = [
        new BillInput(1, Group::Fixed, SplitType::Equal, 100, $ids, []),
        new BillInput(2, Group::Fixed, SplitType::Equal, 100, $ids, []),
    ];
    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::WholeTaka, $bills, a1NoMeals($ids)));
    expect($r->exact['fixed'])->toBe([1 => 100, 2 => 100])->and($r->charged['fixed'])->toBe([1 => 100, 2 => 100]);
});

it('sums meals bills with the meal pool in the meals group; fixed stays separate', function () {
    $ids = [1, 2];
    $bills = [
        new BillInput(1, Group::Fixed, SplitType::Equal, 1000, $ids, []),
        new BillInput(2, Group::Meals, SplitType::Equal, 400, $ids, []),
    ];
    $meals = new MealInput(600, $ids, [1 => 100, 2 => 300], [1 => null, 2 => null], null, null);
    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::TwoDecimals, $bills, $meals));
    expect($r->exact['fixed'])->toBe([1 => 500, 2 => 500])
        ->and($r->exact['meals'])->toBe([1 => 350, 2 => 650]);
});

it('totals unallocated across bills and reports empty-member input safely', function () {
    $bills = [
        new BillInput(1, Group::Fixed, SplitType::FixedPerPerson, 1000, [1, 2], [1 => 300, 2 => 300]),
        new BillInput(2, Group::Fixed, SplitType::Equal, 100, [1, 2], [1 => 150, 2 => 0]),
    ];
    $r = ChargeCalculator::calculate(new ChargeInput(1, [1, 2], RoundingMode::TwoDecimals, $bills, a1NoMeals([1, 2])));
    expect($r->totalUnallocatedPaisa)->toBe(400 + (100 - 150))
        ->and($r->bills[2]->unallocatedPaisa)->toBe(-50);

    $e = ChargeCalculator::calculate(new ChargeInput(1, [], RoundingMode::WholeTaka, [], new MealInput(0, [], [], [], null, null)));
    expect($e->charged)->toBe(['fixed' => [], 'meals' => []]);
});

it('adds rounding deltas of both groups; zero cost gives zeros', function () {
    $ids = [1, 2, 3];
    $bills = [
        new BillInput(1, Group::Fixed, SplitType::Equal, 156345, $ids, []),
        new BillInput(2, Group::Meals, SplitType::Equal, 156345, $ids, []),
    ];
    $r = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::RoundUp, $bills, a1NoMeals($ids)));
    expect($r->totalRoundingDeltaPaisa)->toBe(510);

    $z = ChargeCalculator::calculate(new ChargeInput(1, $ids, RoundingMode::WholeTaka, [], a1NoMeals($ids)));
    expect($z->totalRoundingDeltaPaisa)->toBe(0)->and($z->charged['meals'])->toBe([1 => 0, 2 => 0, 3 => 0]);
});

it('rejects duplicate category ids', function () {
    $b = new BillInput(1, Group::Fixed, SplitType::Equal, 100, [1], []);
    ChargeCalculator::calculate(new ChargeInput(1, [1], RoundingMode::TwoDecimals, [$b, $b], a1NoMeals([1])));
})->throws(InvalidArgumentException::class);
