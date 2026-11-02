<?php

namespace App\Billing\Dto;

use App\Enums\RoundingMode;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class ChargeInput
{
    /**
     * @param list<int> $memberIds active, ascending
     * @param list<BillInput> $bills
     */
    public function __construct(
        public int $monthId,
        public array $memberIds,
        public RoundingMode $roundingMode,
        public array $bills,
        public MealInput $meals,
    ) {}
}
