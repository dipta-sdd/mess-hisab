<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class CloseCheckInput
{
    public function __construct(
        public int $cashPaisa,
        public int $sumBalancesPaisa,
        public int $fixedBillsPaisa,
        public int $fixedExpensesPaisa,
        public int $unallocatedPaisa,
        public int $roundingDeltaPaisa,
        public int $openingPaisa,
        public int $adjustmentsPaisa,
        public int $unchargedFoodPaisa,
        public int $doesntPayNetPaisa,
    ) {}
}
