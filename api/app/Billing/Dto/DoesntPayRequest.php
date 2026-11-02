<?php

namespace App\Billing\Dto;

use App\Enums\DoesntPayMode;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class DoesntPayRequest
{
    /**
     * @param array<int,int> $manual memberId => paisa (manual mode)
     */
    public function __construct(
        public int $debtorMemberId,
        public DoesntPayMode $mode,
        public array $manual,
    ) {}
}
