<?php

namespace App\Services\Balance;

use App\Billing\Dto\BalanceResult;
use App\Billing\Dto\ChargeResult;
use App\Models\Category;
use App\Models\Expense;
use App\Models\LedgerEntry;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Payment;
use Illuminate\Support\Collection;

/**
 * Everything the dashboard / statement / history need about one month, loaded once.
 * Built only by MonthBalanceService; plain data.
 *
 * "Group maps" are ['fixed' => [memberId => paisa], 'meals' => [memberId => paisa]].
 */
final class MonthSnapshot
{
    /**
     * @param  Collection<int,MessMember>  $members  every member of the mess, keyed by id
     * @param  Collection<int,Category>  $categories  every category (archived too), keyed by id
     * @param  list<int>  $memberIds  all mess members, ascending (the engine's reporting set)
     * @param  list<int>  $activeMemberIds  members active in the month (CONTRACT §3)
     * @param  array<int,int>  $carryIn  balance before the month incl. this month's opening rows
     * @param  array<string,array<int,int>>  $charged  charges applied (live engine, or stored rows when closed)
     * @param  ChargeResult  $charge  engine result from raw rows; for a CLOSED month informational only (rate, meals)
     * @param  Collection<int,Payment>  $payments
     * @param  Collection<int,Expense>  $ownPocket  approved expenses paid from a member's pocket
     * @param  Collection<int,LedgerEntry>  $ledger  this month's ledger rows except `opening`
     *                                               (an open month ignores stray charge/rounding rows)
     * @param  array<string,int>  $expensesByGroup  approved expenses of any payer, per group
     * @param  array<int,int>  $depositRequired
     * @param  array<int,int>  $mealsCenti  own + guest meals per active member (before minimums)
     */
    public function __construct(
        public readonly Month $month,
        public readonly bool $stored,
        public readonly Collection $members,
        public readonly Collection $categories,
        public readonly array $memberIds,
        public readonly array $activeMemberIds,
        public readonly array $carryIn,
        public readonly array $charged,
        public readonly BalanceResult $balances,
        public readonly ChargeResult $charge,
        public readonly Collection $payments,
        public readonly Collection $ownPocket,
        public readonly Collection $ledger,
        public readonly array $expensesByGroup,
        public readonly array $depositRequired,
        public readonly array $mealsCenti,
        public readonly int $foodCostPaisa,
        public readonly int $roundingExtraPaisa,
        public readonly string $today,
    ) {}

    /** @return array<int,int> member id => total balance after this month (positive = credit) */
    public function totals(): array
    {
        $out = [];
        foreach ($this->balances->members as $id => $b) {
            $out[$id] = $b->totalPaisa;
        }

        return $out;
    }
}
