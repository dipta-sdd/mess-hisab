<?php

namespace App\Billing\Rounding;

use App\Billing\Dto\RoundingResult;
use App\Enums\RoundingMode;
use InvalidArgumentException;
use LogicException;

/** CONTRACT §4.6 / §5.1. */
final class Rounder
{
    /** @param array<int,int> $exact [memberId => paisa >= 0] */
    public static function apply(RoundingMode $mode, array $exact): RoundingResult
    {
        foreach ($exact as $id => $v) {
            if ($v < 0) {
                throw new InvalidArgumentException("Negative exact amount for member {$id}.");
            }
        }

        $charged = match ($mode) {
            RoundingMode::TwoDecimals => $exact,
            RoundingMode::RoundUp => array_map(static fn (int $v) => intdiv($v + 99, 100) * 100, $exact),
            RoundingMode::WholeTaka => self::wholeTaka($exact),
        };

        $delta = [];
        $total = 0;
        foreach ($exact as $id => $v) {
            $delta[$id] = $charged[$id] - $v;
            $total += $delta[$id];
        }

        return new RoundingResult($charged, $delta, $total);
    }

    /**
     * @param array<int,int> $exact
     * @return array<int,int>
     */
    private static function wholeTaka(array $exact): array
    {
        $targetTaka = intdiv(array_sum($exact) + 50, 100); // half-up
        $floors = [];
        $mods = [];
        foreach ($exact as $id => $v) {
            $floors[$id] = intdiv($v, 100);
            $mods[$id] = $v % 100;
        }
        $extra = $targetTaka - array_sum($floors);
        if ($extra < 0 || $extra > count($exact)) {
            throw new LogicException('Whole-taka rounding produced an impossible remainder.');
        }

        $order = array_keys($exact);
        $pos = array_flip($order);
        usort($order, static fn ($a, $b) => $mods[$b] <=> $mods[$a] ?: $pos[$a] <=> $pos[$b]);
        foreach (array_slice($order, 0, $extra) as $id) {
            $floors[$id]++;
        }

        return array_map(static fn (int $t) => $t * 100, $floors);
    }
}
