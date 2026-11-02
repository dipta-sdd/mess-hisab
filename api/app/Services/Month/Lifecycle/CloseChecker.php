<?php

namespace App\Services\Month\Lifecycle;

use App\Billing\Balance\CloseCheck;
use App\Billing\Dto\CloseCheckInput;
use App\Enums\ExpenseStatus;
use App\Enums\Group;
use App\Enums\LedgerType;
use App\Enums\MonthStatus;
use App\Enums\SplitType;
use App\Enums\ZeroMealResolution;
use App\Models\Category;
use App\Models\Expense;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\Month;
use App\Models\MonthBill;
use App\Services\Balance\MonthBalanceService;
use App\Services\CashPool\CashPool;
use Illuminate\Support\Facades\DB;

/**
 * Task K: the close-check. Reads everything through MonthBalanceService and the engine's CloseCheck;
 * it invents no money logic. The identity is cumulative over all history of the mess (CONTRACT §3).
 *
 * `evaluate()` may SAVE the zero-meal resolution on the month (the engine needs it on the month to
 * price the zero-meal pool); callers that must not persist it use `check()`, which rolls back.
 */
class CloseChecker
{
    public function __construct(private readonly MonthBalanceService $balances) {}

    /**
     * The close-check endpoint: never changes anything.
     *
     * @return array{can_close: bool, blocks: list<array{code: string, data: array<string,mixed>}>}
     */
    public function check(Mess $mess, Month $month, ?ZeroMealResolution $choice): array
    {
        if ($month->status !== MonthStatus::Open) {
            return ['can_close' => false, 'blocks' => [['code' => 'month_closed', 'data' => ['month_id' => $month->id]]]];
        }

        DB::beginTransaction();
        try {
            $ev = $this->evaluate($mess, Month::query()->forMess($mess->id)->findOrFail($month->id), $choice);
        } finally {
            DB::rollBack();
        }

        return ['can_close' => $ev->canClose(), 'blocks' => $ev->blocks];
    }

    /** Runs the close-check on an OPEN month. Call inside a transaction when the choice must persist. */
    public function evaluate(Mess $mess, Month $month, ?ZeroMealResolution $choice): CloseEvaluation
    {
        $snap = $this->balances->snapshot($month);

        // Zero meals with a priced pool: the manager must pick what happens to the food cost.
        $needed = $snap->charge->meal->totalEffectiveMealsCenti === 0 && $snap->foodCostPaisa > 0;
        $wanted = $needed ? ($choice ?? $month->zero_meal_resolution) : null;
        if ($wanted !== $month->zero_meal_resolution) {
            $month->zero_meal_resolution = $wanted;
            $month->save();
            $snap = $this->balances->snapshot($month);
        }

        $blocks = [];
        $earlier = Month::query()->forMess($mess->id)->where('starts_on', '<', $month->starts_on->toDateString())
            ->where('status', MonthStatus::Open->value)->orderBy('starts_on')->pluck('id')->all();
        if ($earlier !== []) {
            $blocks[] = ['code' => 'previous_month_open', 'data' => ['month_ids' => array_map('intval', $earlier)]];
        }

        $pending = Expense::query()->forMess($mess->id)->where('month_id', $month->id)
            ->where('status', ExpenseStatus::Pending->value)->orderBy('id')->pluck('id')->all();
        if ($pending !== []) {
            $blocks[] = ['code' => 'pending_expenses', 'data' => ['count' => count($pending), 'expense_ids' => array_map('intval', $pending)]];
        }

        if ($needed && $wanted === null) {
            $blocks[] = ['code' => 'zero_meals_unresolved', 'data' => ['food_cost_paisa' => $snap->foodCostPaisa]];
        }

        $accepted = MonthBill::query()->forMess($mess->id)->where('month_id', $month->id)
            ->where('unallocated_accepted', true)->pluck('category_id')->flip();
        $unallocated = [];
        foreach ($snap->charge->bills as $categoryId => $split) {
            if ($split->unallocatedPaisa !== 0 && ! $accepted->has($categoryId)) {
                $unallocated[] = [
                    'category_id' => (int) $categoryId,
                    'name' => $snap->categories->get($categoryId)?->name,
                    'unallocated_paisa' => $split->unallocatedPaisa,
                ];
            }
        }
        if ($unallocated !== []) {
            $blocks[] = ['code' => 'unallocated', 'data' => ['bills' => $unallocated]];
        }

        $mismatched = [];
        foreach ($snap->balances->doesntPay as $split) {
            if ($split->mismatchPaisa !== 0) {
                $mismatched[] = [
                    'debtor_member_id' => $split->debtorMemberId,
                    'amount_paisa' => $split->amountPaisa,
                    'shares_paisa' => array_sum($split->shares),
                    'mismatch_paisa' => $split->mismatchPaisa,
                ];
            }
        }
        if ($mismatched !== []) {
            $blocks[] = ['code' => 'doesnt_pay_mismatch', 'data' => ['doesnt_pay' => $mismatched]];
        }

        [$identity, $totals] = $this->identity($mess);
        if (! $identity->ok) {
            $blocks[] = ['code' => 'cash_mismatch', 'data' => [
                'actual_paisa' => $identity->actualPaisa,
                'expected_paisa' => $identity->expectedPaisa,
                'difference_paisa' => $identity->differencePaisa,
            ]];
        }

        return new CloseEvaluation($snap, $blocks, $needed, $wanted, $identity, $totals);
    }

    /**
     * CONTRACT §3 close-check identity over all history (closed months from stored rows, open months live).
     *
     * @return array{0: \App\Billing\Dto\CloseCheckResult, 1: array<int,int>}
     */
    private function identity(Mess $mess): array
    {
        $id = $mess->id;
        $snaps = $this->balances->allSnapshots($mess); // newest first
        $totals = $snaps === [] ? [] : $snaps[0]->totals();

        $closedIds = [];
        $unallocated = 0;
        $rounding = 0;
        $uncharged = 0;
        $doesntPayNet = 0;
        foreach ($snaps as $s) {
            $rounding += $s->roundingExtraPaisa;
            $uncharged -= (int) $s->month->food_carry_in_paisa;
            if ($s->stored) {
                $closedIds[] = $s->month->id;
                $uncharged += (int) $s->month->food_carry_out_paisa;
            } else {
                $unallocated += $s->charge->totalUnallocatedPaisa;
                $uncharged += $s->charge->unchargedFoodPaisa;
                foreach ($s->balances->doesntPay as $split) {
                    $doesntPayNet += $split->mismatchPaisa;
                }
            }
        }
        $unallocated += $this->closedUnallocated($id, $closedIds);

        $fixedCategoryIds = Category::query()->forMess($id)->where('group', Group::Fixed->value)->pluck('id');
        $fixedBills = (int) MonthBill::query()->forMess($id)->whereIn('category_id', $fixedCategoryIds)->sum('amount_paisa');
        $fixedExpenses = (int) Expense::query()->forMess($id)->where('status', ExpenseStatus::Approved->value)
            ->whereIn('category_id', $fixedCategoryIds)->sum('amount_paisa');

        $ledgerSum = fn (array $types): int => (int) LedgerEntry::query()->forMess($id)->whereNotNull('member_id')
            ->whereIn('type', array_map(fn (LedgerType $t) => $t->value, $types))->sum('amount_paisa');
        $doesntPayNet += $ledgerSum([LedgerType::DoesntPayOut, LedgerType::DoesntPayIn]);

        $result = CloseCheck::verify(new CloseCheckInput(
            cashPaisa: CashPool::balance($mess),
            sumBalancesPaisa: array_sum($totals),
            fixedBillsPaisa: $fixedBills,
            fixedExpensesPaisa: $fixedExpenses,
            unallocatedPaisa: $unallocated,
            roundingDeltaPaisa: $rounding,
            openingPaisa: $ledgerSum([LedgerType::Opening]),
            adjustmentsPaisa: $ledgerSum([LedgerType::Adjustment]),
            unchargedFoodPaisa: $uncharged,
            doesntPayNetPaisa: $doesntPayNet,
        ));

        return [$result, $totals];
    }

    /**
     * Unallocated money of closed months, from stored data: every per-bill total minus what the close wrote
     * as per-bill charge rows (rows with meta.category_id). By-meal categories have no bill split.
     *
     * @param  list<int>  $monthIds
     */
    private function closedUnallocated(int $messId, array $monthIds): int
    {
        if ($monthIds === []) {
            return 0;
        }
        $billCategories = Category::query()->forMess($messId)->where('split_type', '!=', SplitType::ByMeal->value);
        $fixedIds = (clone $billCategories)->where('group', Group::Fixed->value)->pluck('id');
        $mealsIds = (clone $billCategories)->where('group', Group::Meals->value)->pluck('id');

        $totals = (int) MonthBill::query()->forMess($messId)->whereIn('month_id', $monthIds)->whereIn('category_id', $fixedIds)->sum('amount_paisa')
            + (int) Expense::query()->forMess($messId)->whereIn('month_id', $monthIds)->whereIn('category_id', $mealsIds)
                ->where('status', ExpenseStatus::Approved->value)->sum('amount_paisa');
        $charged = -(int) LedgerEntry::query()->forMess($messId)->whereIn('month_id', $monthIds)
            ->where('type', LedgerType::Charge->value)->whereNotNull('meta->category_id')->sum('amount_paisa');

        return $totals - $charged;
    }
}
