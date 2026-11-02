<?php

namespace App\Billing\Dto;

/** Frozen contract — see docs/CONTRACT.md §5.3. Lead-owned. */
final readonly class BalanceInput
{
    /**
     * @param list<int> $memberIds everyone to report, ascending
     * @param list<int> $activeMemberIds
     * @param array<int,int> $carryIn
     * @param array<string,array<int,int>> $payments 'fixed'|'meals' => memberId => paisa
     * @param array<string,array<int,int>> $ownPocket
     * @param array<string,array<int,int>> $ledger rows except charge/rounding
     * @param array<string,array<int,int>> $charges positive
     * @param array<int,int> $mealWeights effective meals
     * @param list<DoesntPayRequest> $doesntPay live only
     * @param array<int,int> $depositRequired
     */
    public function __construct(
        public array $memberIds,
        public array $activeMemberIds,
        public array $carryIn,
        public array $payments,
        public array $ownPocket,
        public array $ledger,
        public array $charges,
        public array $mealWeights,
        public array $doesntPay,
        public array $depositRequired,
        public ?string $fixedDeadline,  // Y-m-d
        public ?string $depositDeadline,  // Y-m-d
        public string $today,  // Y-m-d
    ) {}
}
