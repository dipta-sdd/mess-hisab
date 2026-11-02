<?php

namespace App\Billing\Split;

use App\Billing\Dto\BillInput;
use App\Billing\Dto\BillSplit;
use App\Enums\SplitType;
use InvalidArgumentException;

/** CONTRACT §4.5 / §5.1. */
final class BillSplitter
{
    public static function split(BillInput $bill): BillSplit
    {
        if ($bill->splitType === SplitType::ByMeal) {
            throw new InvalidArgumentException('by_meal bills are handled by the meal pool, not BillSplitter.');
        }

        $ids = $bill->memberIds;
        $idSet = array_flip($ids);
        foreach ($bill->overrides as $id => $amount) {
            if (! isset($idSet[$id])) {
                throw new InvalidArgumentException("Override for member {$id} who is not in the bill's member list.");
            }
            if ($amount < 0) {
                throw new InvalidArgumentException("Negative override for member {$id}.");
            }
        }

        $shares = array_fill_keys($ids, 0);

        if ($bill->splitType === SplitType::FixedPerPerson) {
            foreach ($bill->overrides as $id => $amount) {
                $shares[$id] = $amount;
            }
        } else { // Equal
            $overrideSum = 0;
            foreach ($bill->overrides as $id => $amount) {
                $shares[$id] = $amount;
                $overrideSum += $amount;
            }
            $rest = array_values(array_filter($ids, static fn ($id) => ! array_key_exists($id, $bill->overrides)));
            $remainder = $bill->totalPaisa - $overrideSum;
            if ($rest !== [] && $remainder > 0) {
                foreach (LargestRemainder::split($remainder, array_fill_keys($rest, 1)) as $id => $v) {
                    $shares[$id] = $v;
                }
            }
            // remainder <= 0 (or nobody left): non-overridden stay 0, gap goes to unallocated.
        }

        return new BillSplit($bill->categoryId, $bill->group, $shares, $bill->totalPaisa - array_sum($shares));
    }
}
