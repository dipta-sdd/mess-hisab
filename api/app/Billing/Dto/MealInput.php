<?php

namespace App\Billing\Dto;

use App\Enums\ZeroMealResolution;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class MealInput
{
    /**
     * @param list<int> $memberIds
     * @param array<int,int> $mealsCenti own + guest
     * @param array<int,int|null> $minMealsCenti null = no minimum
     */
    public function __construct(
        public int $costPaisa,  // Σ approved by_meal expenses + food_carry_in
        public array $memberIds,
        public array $mealsCenti,
        public array $minMealsCenti,
        public ?int $minPayablePaisa,
        public ?ZeroMealResolution $zeroMealResolution,
    ) {}
}
