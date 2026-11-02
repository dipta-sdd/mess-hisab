<?php

namespace App\Billing\Balance;

use App\Billing\Dto\CloseCheckInput;
use App\Billing\Dto\CloseCheckResult;

/** CONTRACT §3 close-check identity. */
final class CloseCheck
{
    public static function verify(CloseCheckInput $in): CloseCheckResult
    {
        $actual = $in->cashPaisa - $in->sumBalancesPaisa;
        $expected = $in->fixedBillsPaisa
            - $in->fixedExpensesPaisa
            - $in->unallocatedPaisa
            + $in->roundingDeltaPaisa
            - $in->openingPaisa
            - $in->adjustmentsPaisa
            - $in->unchargedFoodPaisa
            - $in->doesntPayNetPaisa;
        $diff = $actual - $expected;

        return new CloseCheckResult($diff === 0, $actual, $expected, $diff);
    }
}
