<?php

namespace App\Billing\DoesntPay;

use App\Billing\Split\LargestRemainder;

final class RepaymentAllocator
{
    /**
     * Credit a later repayment back to the others by the saved doesn't-pay shares.
     *
     * @param array<int,int> $savedShares memberId => paisa
     * @return array<int,int> memberId => paisa, sum = $repayment
     */
    public static function allocate(int $repayment, array $savedShares): array
    {
        return LargestRemainder::split($repayment, $savedShares);
    }
}
