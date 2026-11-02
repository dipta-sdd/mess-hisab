<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class RoundingResult
{
    /**
     * @param array<int,int> $charged
     * @param array<int,int> $delta charged − exact
     */
    public function __construct(
        public array $charged,
        public array $delta,
        public int $totalDeltaPaisa,
    ) {}
}
