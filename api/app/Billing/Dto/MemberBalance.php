<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class MemberBalance
{
    public function __construct(
        public int $memberId,
        public GroupBalance $fixed,
        public GroupBalance $meals,
        public int $totalPaisa,
        public int $fixedOutstandingPaisa,
        public int $depositRequiredPaisa,
        public int $depositOutstandingPaisa,
        public int $fixedOverdueDays,
        public int $depositOverdueDays,
    ) {}
}
