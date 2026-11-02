<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class MealResult
{
    /**
     * @param array<int,int> $charges
     * @param array<int,int> $effectiveMealsCenti
     */
    public function __construct(
        public array $charges,
        public array $effectiveMealsCenti,
        public int $totalEffectiveMealsCenti,
        public int $displayRatePaisa,  // display only
        public bool $zeroMealsUnresolved,
        public int $carryOutPaisa,
        public int $unchargedFoodPaisa,
    ) {}
}
