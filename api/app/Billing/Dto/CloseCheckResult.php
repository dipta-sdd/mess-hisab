<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class CloseCheckResult
{
    public function __construct(
        public bool $ok,
        public int $actualPaisa,  // cash − Σbalance
        public int $expectedPaisa,
        public int $differencePaisa,  // actual − expected
    ) {}
}
