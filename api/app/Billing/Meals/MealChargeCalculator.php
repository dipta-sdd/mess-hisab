<?php

namespace App\Billing\Meals;

use App\Billing\Dto\MealInput;
use App\Billing\Dto\MealResult;
use App\Billing\Split\LargestRemainder;
use App\Enums\ZeroMealResolution;

/** CONTRACT §4.2–4.4 / §5.1. */
final class MealChargeCalculator
{
    public static function calculate(MealInput $in): MealResult
    {
        $ids = $in->memberIds;
        $cost = $in->costPaisa;

        $effective = [];
        foreach ($ids as $id) {
            $m = $in->mealsCenti[$id] ?? 0;
            $min = $in->minMealsCenti[$id] ?? null;
            $effective[$id] = $min !== null ? max($m, $min) : $m;
        }
        $total = array_sum($effective);
        $zeroCharges = array_fill_keys($ids, 0);

        if ($total === 0) {
            if ($cost === 0) {
                return new MealResult($zeroCharges, $effective, 0, 0, false, 0, 0);
            }

            return match ($in->zeroMealResolution) {
                null => new MealResult($zeroCharges, $effective, 0, 0, true, 0, $cost),
                ZeroMealResolution::Carry => new MealResult($zeroCharges, $effective, 0, 0, false, $cost, $cost),
                ZeroMealResolution::SplitEqual => new MealResult(
                    LargestRemainder::split($cost, array_fill_keys($ids, 1)), $effective, 0, 0, false, 0, 0
                ),
            };
        }

        $charges = LargestRemainder::split($cost, $effective);

        $p = $in->minPayablePaisa;
        if ($p !== null && $p > 0 && $cost > 0) {
            $charges = self::applyMinPayable($cost, $effective, $charges, $p);
        }

        // round_half_up(cost * 100 / total), display only
        $rate = intdiv(2 * $cost * 100 + $total, 2 * $total);

        return new MealResult($charges, $effective, $total, $rate, false, 0, 0);
    }

    /**
     * @param array<int,int> $effective
     * @param array<int,int> $charges
     * @return array<int,int>
     */
    private static function applyMinPayable(int $cost, array $effective, array $charges, int $p): array
    {
        if ($p * count($charges) >= $cost) {
            return LargestRemainder::split($cost, array_fill_keys(array_keys($charges), 1));
        }

        $raised = [];
        while (true) {
            $newly = [];
            foreach ($charges as $id => $c) {
                if (! isset($raised[$id]) && $c < $p) {
                    $newly[$id] = true;
                }
            }
            if ($newly === []) {
                return $charges;
            }

            $surplus = 0;
            foreach ($newly as $id => $_) {
                $surplus += $p - $charges[$id];
                $charges[$id] = $p;
                $raised[$id] = true;
            }

            $weights = [];
            foreach ($effective as $id => $w) {
                if (! isset($raised[$id])) {
                    $weights[$id] = $w;
                }
            }
            if (array_sum($weights) === 0) {
                // Unreachable when p*n < cost; never lose money silently.
                return LargestRemainder::split($cost, array_fill_keys(array_keys($charges), 1));
            }
            foreach (LargestRemainder::split($surplus, $weights) as $id => $take) {
                $charges[$id] -= $take;
            }
        }
    }
}
