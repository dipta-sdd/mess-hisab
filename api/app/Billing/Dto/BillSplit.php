<?php

namespace App\Billing\Dto;

use App\Enums\Group;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class BillSplit
{
    /**
     * @param array<int,int> $shares memberId => paisa, every member present
     */
    public function __construct(
        public int $categoryId,
        public Group $group,
        public array $shares,
        public int $unallocatedPaisa,  // total − Σshares
    ) {}
}
