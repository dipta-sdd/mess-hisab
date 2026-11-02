<?php

use App\Billing\Dto\BillInput;
use App\Billing\Dto\MealInput;
use App\Billing\Meals\MealChargeCalculator;
use App\Billing\Rounding\Rounder;
use App\Billing\Split\BillSplitter;
use App\Billing\Split\LargestRemainder;
use App\Enums\Group;
use App\Enums\RoundingMode;
use App\Enums\SplitType;
use App\Enums\ZeroMealResolution;

function a1Meal(int $cost, array $meals, array $min = [], ?int $p = null, ?ZeroMealResolution $res = null): MealInput
{
    $ids = array_keys($meals);

    return new MealInput($cost, $ids, $meals, $min + array_fill_keys($ids, null), $p, $res);
}

// ---- §4.1 largest remainder
it('LR: example 4.1, empty, zero total, ties, negatives', function () {
    expect(LargestRemainder::split(800000, [1 => 60, 2 => 50, 3 => 40, 4 => 20]))->toBe([1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118])
        ->and(LargestRemainder::split(0, []))->toBe([])
        ->and(LargestRemainder::split(0, [1 => 0, 2 => 0]))->toBe([1 => 0, 2 => 0])
        ->and(LargestRemainder::split(2, [5 => 1, 9 => 1, 7 => 1]))->toBe([5 => 1, 9 => 1, 7 => 0])
        ->and(LargestRemainder::split(-800000, [1 => 60, 2 => 50, 3 => 40, 4 => 20]))->toBe([1 => -282353, 2 => -235294, 3 => -188235, 4 => -94118]);
});

it('LR: sum always equals total', function () {
    foreach ([[12345, [3, 7, 11]], [1, [1, 1, 1, 1]], [999999, [1, 0, 2, 5]], [-77, [2, 3]]] as [$t, $w]) {
        expect(array_sum(LargestRemainder::split($t, $w)))->toBe($t);
    }
});

it('LR: empty weights with non-zero total throws', function () {
    LargestRemainder::split(5, []);
})->throws(InvalidArgumentException::class);

// ---- §4.5 bills
it('Bill: equal with override (4.5 example)', function () {
    $s = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 90000, [1, 2, 3], [3 => 10000]));
    expect($s->shares)->toBe([1 => 40000, 2 => 40000, 3 => 10000])->and($s->unallocatedPaisa)->toBe(0);
});

it('Bill: all overridden gives unallocated, can be negative', function () {
    $a = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 90000, [1, 2], [1 => 30000, 2 => 30000]));
    $b = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 50000, [1, 2], [1 => 30000, 2 => 30000]));
    expect($a->unallocatedPaisa)->toBe(30000)->and($b->unallocatedPaisa)->toBe(-10000);
});

it('Bill: overrides exceeding total leave the others at 0 and negative unallocated', function () {
    $s = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 50000, [1, 2, 3], [3 => 70000]));
    expect($s->shares)->toBe([1 => 0, 2 => 0, 3 => 70000])->and($s->unallocatedPaisa)->toBe(-20000);
});

it('Bill: fixed_per_person missing member gets 0; zero cost; empty members', function () {
    $s = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::FixedPerPerson, 500, [1, 2], [1 => 200]));
    $z = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 0, [1, 2], []));
    $e = BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 100, [], []));
    expect($s->shares)->toBe([1 => 200, 2 => 0])->and($s->unallocatedPaisa)->toBe(300)
        ->and($z->shares)->toBe([1 => 0, 2 => 0])->and($z->unallocatedPaisa)->toBe(0)
        ->and($e->shares)->toBe([])->and($e->unallocatedPaisa)->toBe(100);
});

it('Bill: equal split remainder goes to lower id; negative total is all unallocated', function () {
    $s = BillSplitter::split(new BillInput(1, Group::Meals, SplitType::Equal, 100, [1, 2, 3], []));
    $n = BillSplitter::split(new BillInput(1, Group::Meals, SplitType::Equal, -100, [1, 2], []));
    expect($s->shares)->toBe([1 => 34, 2 => 33, 3 => 33])->and($n->shares)->toBe([1 => 0, 2 => 0])->and($n->unallocatedPaisa)->toBe(-100);
});

it('Bill: override for unknown member throws', function () {
    BillSplitter::split(new BillInput(1, Group::Fixed, SplitType::Equal, 100, [1, 2], [9 => 5]));
})->throws(InvalidArgumentException::class);

it('Bill: by_meal bill throws', function () {
    BillSplitter::split(new BillInput(1, Group::Meals, SplitType::ByMeal, 100, [1], []));
})->throws(InvalidArgumentException::class);

// ---- §4.2 min meals
it('Meal: §4.2 example (Nilu 95238)', function () {
    $r = MealChargeCalculator::calculate(a1Meal(1000000, [1 => 10000, 2 => 9000, 3 => 1000], [1 => 2000, 2 => 2000, 3 => 2000]));
    expect($r->effectiveMealsCenti)->toBe([1 => 10000, 2 => 9000, 3 => 2000])
        ->and($r->totalEffectiveMealsCenti)->toBe(21000)
        ->and($r->charges)->toBe([1 => 476191, 2 => 428571, 3 => 95238])
        ->and($r->displayRatePaisa)->toBe(4762);
});

it('Meal: no minimum means no uplift; missing keys count as 0 meals', function () {
    $in = new MealInput(1000, [1, 2], [1 => 100], [], null, null);
    $r = MealChargeCalculator::calculate($in);
    expect($r->charges)->toBe([1 => 1000, 2 => 0]);
});

// ---- §4.3 min payable
it('Meal: §4.3 min payable example', function () {
    $r = MealChargeCalculator::calculate(a1Meal(300000, [1 => 10000, 2 => 10000, 3 => 1000], [], 50000));
    expect($r->charges)->toBe([1 => 125000, 2 => 125000, 3 => 50000]);
});

it('Meal: min payable P*n >= cost splits equally', function () {
    $r = MealChargeCalculator::calculate(a1Meal(100000, [1 => 10000, 2 => 100, 3 => 0], [], 40000));
    expect($r->charges)->toBe([1 => 33334, 2 => 33333, 3 => 33333]);
});

it('Meal: min payable cascades until nobody is below P', function () {
    // raw 1000/1000-ish: weights 100,100,10,5 on cost 1000 -> D,C low; surplus pushes A/B down but stays >= P
    $r = MealChargeCalculator::calculate(a1Meal(100000, [1 => 10000, 2 => 10000, 3 => 1000, 4 => 500], [], 20000));
    expect(array_sum($r->charges))->toBe(100000)
        ->and(min($r->charges))->toBeGreaterThanOrEqual(20000)
        ->and($r->charges[3])->toBe(20000)->and($r->charges[4])->toBe(20000);
});

it('Meal: min payable applies after min meals', function () {
    // min meals lifts C to 100 -> equal share, so P=0 effect; no one below P
    $r = MealChargeCalculator::calculate(a1Meal(300000, [1 => 10000, 2 => 10000, 3 => 1000], [3 => 10000], 50000));
    expect($r->charges)->toBe([1 => 100000, 2 => 100000, 3 => 100000]);
});

it('Meal: zero cost yields zero charges, min payable ignored', function () {
    $r = MealChargeCalculator::calculate(a1Meal(0, [1 => 100, 2 => 100], [], 5000));
    expect($r->charges)->toBe([1 => 0, 2 => 0])->and($r->displayRatePaisa)->toBe(0);
});

// ---- §4.4 zero meals
it('Meal: zero meals unresolved / split_equal / carry', function () {
    $m = [1 => 0, 2 => 0, 3 => 0];
    $u = MealChargeCalculator::calculate(a1Meal(100000, $m));
    $e = MealChargeCalculator::calculate(a1Meal(100000, $m, [], null, ZeroMealResolution::SplitEqual));
    $c = MealChargeCalculator::calculate(a1Meal(100000, $m, [], null, ZeroMealResolution::Carry));
    expect($u->zeroMealsUnresolved)->toBeTrue()->and($u->unchargedFoodPaisa)->toBe(100000)->and($u->carryOutPaisa)->toBe(0)
        ->and($e->charges)->toBe([1 => 33334, 2 => 33333, 3 => 33333])->and($e->unchargedFoodPaisa)->toBe(0)
        ->and($c->carryOutPaisa)->toBe(100000)->and($c->unchargedFoodPaisa)->toBe(100000)->and($c->zeroMealsUnresolved)->toBeFalse();
});

it('Meal: zero meals and zero cost is not unresolved; empty members', function () {
    $z = MealChargeCalculator::calculate(a1Meal(0, [1 => 0]));
    $e = MealChargeCalculator::calculate(new MealInput(0, [], [], [], null, null));
    expect($z->zeroMealsUnresolved)->toBeFalse()->and($z->unchargedFoodPaisa)->toBe(0)->and($e->charges)->toBe([]);
});

it('Meal: display rate rounds half up', function () {
    // 1000 paisa / 3 meals(300 centi) -> 1000*100/300 = 333.33 -> 333 ; 1001*100/300 = 333.67 -> 334
    expect(MealChargeCalculator::calculate(a1Meal(1000, [1 => 300]))->displayRatePaisa)->toBe(333)
        ->and(MealChargeCalculator::calculate(a1Meal(1001, [1 => 300]))->displayRatePaisa)->toBe(334)
        ->and(MealChargeCalculator::calculate(a1Meal(3, [1 => 400]))->displayRatePaisa)->toBe(1); // 0.75 -> 1
});

// ---- §4.6 rounding
it('Rounder: two_decimals is identity', function () {
    $r = Rounder::apply(RoundingMode::TwoDecimals, [1 => 12345, 2 => 55]);
    expect($r->charged)->toBe([1 => 12345, 2 => 55])->and($r->delta)->toBe([1 => 0, 2 => 0])->and($r->totalDeltaPaisa)->toBe(0);
});

it('Rounder: whole_taka example 1 (2824/2353/1882/941)', function () {
    $r = Rounder::apply(RoundingMode::WholeTaka, [1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118]);
    expect($r->charged)->toBe([1 => 282400, 2 => 235300, 3 => 188200, 4 => 94100])->and($r->totalDeltaPaisa)->toBe(0);
});

it('Rounder: whole_taka half-up target can produce a non-zero total delta', function () {
    // total 100 paisa*... 3 members of 50 paisa: sum 150 -> T=2 taka (half-up of 1.5); floors 0 -> two get +1
    $r = Rounder::apply(RoundingMode::WholeTaka, [1 => 50, 2 => 50, 3 => 50]);
    expect($r->charged)->toBe([1 => 100, 2 => 100, 3 => 0])->and($r->totalDeltaPaisa)->toBe(50);
    // 149 total -> T=1
    $q = Rounder::apply(RoundingMode::WholeTaka, [1 => 50, 2 => 50, 3 => 49]);
    expect($q->charged)->toBe([1 => 100, 2 => 0, 3 => 0])->and($q->totalDeltaPaisa)->toBe(-49);
});

it('Rounder: whole_taka tie on remainder goes to lower id', function () {
    $r = Rounder::apply(RoundingMode::WholeTaka, [1 => 150, 2 => 150, 3 => 100]);
    // sum 400 -> T=4; floors 1+1+1=3 -> one extra, tie 50/50 -> member 1
    expect($r->charged)->toBe([1 => 200, 2 => 100, 3 => 100]);
});

it('Rounder: round_up example 52115 -> 52200 extra 85; exact taka unchanged', function () {
    $r = Rounder::apply(RoundingMode::RoundUp, [1 => 52115, 2 => 52100, 3 => 0]);
    expect($r->charged)->toBe([1 => 52200, 2 => 52100, 3 => 0])->and($r->delta)->toBe([1 => 85, 2 => 0, 3 => 0])->and($r->totalDeltaPaisa)->toBe(85);
});

it('Rounder: empty input and negative input', function () {
    expect(Rounder::apply(RoundingMode::WholeTaka, [])->charged)->toBe([]);
    Rounder::apply(RoundingMode::WholeTaka, [1 => -5]);
})->throws(InvalidArgumentException::class);
