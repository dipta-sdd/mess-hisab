<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class ChargeResult
{
    /**
     * @param array<int,BillSplit> $bills categoryId => split
     * @param array<string,array<int,int>> $exact 'fixed'|'meals' => memberId => paisa
     * @param array<string,RoundingResult> $rounding 'fixed'|'meals'
     * @param array<string,array<int,int>> $charged after rounding
     */
    public function __construct(
        public array $bills,
        public MealResult $meal,
        public array $exact,
        public array $rounding,
        public array $charged,
        public int $totalUnallocatedPaisa,
        public int $totalRoundingDeltaPaisa,
        public int $unchargedFoodPaisa,
    ) {}
}
