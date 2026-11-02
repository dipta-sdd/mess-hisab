<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class BalanceResult
{
    /**
     * @param array<int,MemberBalance> $members
     * @param list<DoesntPaySplit> $doesntPay
     */
    public function __construct(
        public array $members,
        public array $doesntPay,
    ) {}
}
