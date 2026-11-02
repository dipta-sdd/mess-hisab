<?php

namespace App\Billing\DoesntPay;

use InvalidArgumentException;

/**
 * Integer largest-remainder split, CONTRACT §5.1 semantics.
 *
 * @internal A2-private copy so DoesntPay does not depend on task A1's Split\LargestRemainder.
 */
final class LargestRemainderSplit
{
    /**
     * @param array<int|string,int> $weights key => weight >= 0
     * @return array<int|string,int> same keys/order, sum = $total
     */
    public static function split(int $total, array $weights): array
    {
        if ($weights === []) {
            if ($total !== 0) {
                throw new InvalidArgumentException('Cannot split a non-zero total over no weights.');
            }

            return [];
        }
        foreach ($weights as $w) {
            if ($w < 0) {
                throw new InvalidArgumentException('Weights must be >= 0.');
            }
        }
        $sum = array_sum($weights);
        if ($total === 0) {
            return array_fill_keys(array_keys($weights), 0);
        }
        if ($sum === 0) {
            throw new InvalidArgumentException('Cannot split a non-zero total over all-zero weights.');
        }

        $abs = abs($total);
        $shares = [];
        $rems = [];
        $pos = 0;
        foreach ($weights as $key => $w) {
            $num = $abs * $w;
            $shares[$key] = intdiv($num, $sum);
            $rems[] = ['key' => $key, 'rem' => $num % $sum, 'pos' => $pos++];
        }
        $left = $abs - array_sum($shares);
        usort($rems, fn ($a, $b) => $b['rem'] <=> $a['rem'] ?: $a['pos'] <=> $b['pos']);
        for ($i = 0; $i < $left; $i++) {
            $shares[$rems[$i]['key']]++;
        }
        if ($total < 0) {
            foreach ($shares as $k => $v) {
                $shares[$k] = -$v;
            }
        }

        return $shares;
    }
}
