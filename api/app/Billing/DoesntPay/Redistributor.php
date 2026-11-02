<?php

namespace App\Billing\DoesntPay;

use App\Billing\Split\LargestRemainder;

use App\Billing\Dto\DoesntPaySplit;
use App\Enums\DoesntPayMode;

final class Redistributor
{
    /**
     * Split a debtor's unpaid amount among the other members.
     * The returned debtorMemberId is 0 (unknown here); BalanceCalculator uses splitFor().
     *
     * @param list<int> $memberIds the members who absorb the debt (ascending)
     * @param array<int,int> $mealWeights effective meals by member id
     * @param array<int,int> $manual typed shares
     */
    public static function split(int $amount, DoesntPayMode $mode, array $memberIds, array $mealWeights, array $manual): DoesntPaySplit
    {
        return self::splitFor(0, $amount, $mode, $memberIds, $mealWeights, $manual);
    }

    /**
     * @param list<int> $memberIds
     * @param array<int,int> $mealWeights
     * @param array<int,int> $manual
     */
    public static function splitFor(int $debtorId, int $amount, DoesntPayMode $mode, array $memberIds, array $mealWeights, array $manual): DoesntPaySplit
    {
        if ($mode === DoesntPayMode::Manual) {
            $shares = $manual;
            ksort($shares);

            return new DoesntPaySplit($debtorId, $amount, $shares, $amount - array_sum($shares));
        }

        if ($memberIds === [] || $amount === 0) {
            return new DoesntPaySplit($debtorId, $amount, array_fill_keys($memberIds, 0), $amount);
        }

        $equal = array_fill_keys($memberIds, 1);
        if ($mode === DoesntPayMode::ByMeals) {
            $weights = [];
            foreach ($memberIds as $id) {
                $weights[$id] = max(0, $mealWeights[$id] ?? 0);
            }
            if (array_sum($weights) === 0) {
                $weights = $equal;
            }
        } else {
            $weights = $equal;
        }

        $shares = LargestRemainder::split($amount, $weights);

        return new DoesntPaySplit($debtorId, $amount, $shares, $amount - array_sum($shares));
    }
}
