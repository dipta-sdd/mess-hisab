<?php

namespace App\Billing\Charges;

use App\Billing\Dto\ChargeInput;
use App\Billing\Dto\ChargeResult;
use App\Billing\Meals\MealChargeCalculator;
use App\Billing\Rounding\Rounder;
use App\Billing\Split\BillSplitter;
use App\Enums\Group;
use InvalidArgumentException;

/** CONTRACT §5.1: bills + meal pool -> per-group exact -> rounded charges. */
final class ChargeCalculator
{
    public static function calculate(ChargeInput $in): ChargeResult
    {
        $zero = array_fill_keys($in->memberIds, 0);
        $exact = [Group::Fixed->value => $zero, Group::Meals->value => $zero];

        $splits = [];
        $unallocated = 0;
        foreach ($in->bills as $bill) {
            if (isset($splits[$bill->categoryId])) {
                throw new InvalidArgumentException("Duplicate bill for category {$bill->categoryId}.");
            }
            $split = BillSplitter::split($bill);
            $splits[$bill->categoryId] = $split;
            $unallocated += $split->unallocatedPaisa;
            foreach ($split->shares as $id => $v) {
                $exact[$bill->group->value][$id] = ($exact[$bill->group->value][$id] ?? 0) + $v;
            }
        }

        $meal = MealChargeCalculator::calculate($in->meals);
        foreach ($meal->charges as $id => $v) {
            $exact[Group::Meals->value][$id] = ($exact[Group::Meals->value][$id] ?? 0) + $v;
        }

        $rounding = [];
        $charged = [];
        $totalDelta = 0;
        foreach ([Group::Fixed->value, Group::Meals->value] as $g) {
            ksort($exact[$g]);
            $r = Rounder::apply($in->roundingMode, $exact[$g]);
            $rounding[$g] = $r;
            $charged[$g] = $r->charged;
            $totalDelta += $r->totalDeltaPaisa;
        }

        return new ChargeResult($splits, $meal, $exact, $rounding, $charged, $unallocated, $totalDelta, $meal->unchargedFoodPaisa);
    }
}
