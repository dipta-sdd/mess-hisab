<?php

namespace App\Services\Month\Lifecycle;

use App\Billing\Dto\CloseCheckResult;
use App\Enums\ZeroMealResolution;
use App\Services\Balance\MonthSnapshot;

/** What the close-check found for one open month (plain data). */
final class CloseEvaluation
{
    /**
     * @param  list<array{code: string, data: array<string,mixed>}>  $blocks
     * @param  array<int,int>  $totalsBefore  member id => total balance after the newest month, right now
     */
    public function __construct(
        public readonly MonthSnapshot $snapshot,
        public readonly array $blocks,
        public readonly bool $zeroMealsNeeded,
        public readonly ?ZeroMealResolution $resolution,
        public readonly ?CloseCheckResult $identity,
        public readonly array $totalsBefore,
    ) {}

    public function canClose(): bool
    {
        return $this->blocks === [];
    }
}
