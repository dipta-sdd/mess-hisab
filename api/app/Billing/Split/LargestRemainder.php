<?php

namespace App\Billing\Split;

use InvalidArgumentException;

/** Largest-remainder apportionment in pure int math. CONTRACT §5.1 / §4.1. */
final class LargestRemainder
{
    /**
     * @param array<int,int> $weights [key => int >= 0]
     * @return array<int,int> same keys/order as $weights, sum = $total
     */
    public static function split(int $total, array $weights): array
    {
        $sumW = 0;
        foreach ($weights as $w) {
            if ($w < 0) {
                throw new InvalidArgumentException('Weights must be >= 0.');
            }
            $sumW += $w;
        }

        if ($total === 0) {
            return array_map(static fn () => 0, $weights);
        }
        if ($sumW === 0) {
            throw new InvalidArgumentException('Cannot split a non-zero total over zero weights.');
        }

        $abs = abs($total);
        $shares = [];
        $rems = [];
        $assigned = 0;
        foreach ($weights as $k => $w) {
            $prod = $abs * $w;
            $shares[$k] = intdiv($prod, $sumW);
            $rems[$k] = $prod % $sumW;
            $assigned += $shares[$k];
        }

        $left = $abs - $assigned;
        if ($left > 0) {
            $order = array_keys($weights);
            $pos = array_flip($order);
            usort($order, static function ($a, $b) use ($rems, $pos) {
                return $rems[$b] <=> $rems[$a] ?: $pos[$a] <=> $pos[$b];
            });
            foreach (array_slice($order, 0, $left) as $k) {
                $shares[$k]++;
            }
        }

        if ($total < 0) {
            foreach ($shares as $k => $v) {
                $shares[$k] = -$v;
            }
        }

        return $shares;
    }
}
