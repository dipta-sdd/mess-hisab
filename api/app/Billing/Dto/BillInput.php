<?php

namespace App\Billing\Dto;

use App\Enums\Group;
use App\Enums\SplitType;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class BillInput
{
    /**
     * @param list<int> $memberIds active members, ascending
     * @param array<int,int> $overrides memberId => paisa
     */
    public function __construct(
        public int $categoryId,
        public Group $group,
        public SplitType $splitType,  // equal or fixed_per_person
        public int $totalPaisa,
        public array $memberIds,
        public array $overrides,
    ) {}
}
