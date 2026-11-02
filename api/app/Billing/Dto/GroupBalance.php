<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class GroupBalance
{
    public function __construct(
        public int $carryInPaisa,  // fixed only
        public int $paymentsPaisa,
        public int $ownPocketPaisa,
        public int $ledgerPaisa,
        public int $chargesPaisa,
        public int $doesntPayPaisa,
        public int $balancePaisa,
    ) {}
}
