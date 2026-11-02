<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class DoesntPaySplit
{
    /**
     * @param array<int,int> $shares
     */
    public function __construct(
        public int $debtorMemberId,
        public int $amountPaisa,  // |T|, 0 if T ≥ 0
        public array $shares,
        public int $mismatchPaisa,  // amount − Σshares
    ) {}
}
