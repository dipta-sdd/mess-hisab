<?php

namespace App\Services\Balance;

use App\Billing\Balance\BalanceCalculator;
use App\Billing\Charges\ChargeCalculator;
use App\Billing\Dto\BalanceInput;
use App\Billing\Dto\BalanceResult;
use App\Billing\Dto\BillInput;
use App\Billing\Dto\ChargeInput;
use App\Billing\Dto\DoesntPayRequest;
use App\Billing\Dto\MealInput;
use App\Enums\ExpenseStatus;
use App\Enums\Group;
use App\Enums\LedgerType;
use App\Enums\MonthStatus;
use App\Enums\PaidBy;
use App\Enums\RecoverableStatus;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\ChargeOverride;
use App\Models\Expense;
use App\Models\LedgerEntry;
use App\Models\MealEntry;
use App\Models\MemberMonthSetting;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\MonthBill;
use App\Models\Payment;
use App\Models\Recoverable;
use App\Models\RecoverableShare;
use App\Services\Month\Calendar;
use Illuminate\Support\Collection;

/**
 * Task J: read-only balances. Loads raw rows into engine DTOs and runs ChargeCalculator + BalanceCalculator.
 * NEVER writes anything.
 *
 * Open month: charges are computed live (CONTRACT §3); nothing is stored.
 * Closed month: charges come from the stored `charge` / `rounding` ledger rows (written by task K at close;
 * a row's group is its group, a null group counts as fixed). The engine is still run on the raw rows, but only
 * for display figures (meal rate, total meals) — never for money.
 *
 * Carry-in of month M = the balance after every earlier month, plus M's own `opening` rows (CONTRACT §3).
 * Earlier months are replayed oldest to newest from the first open one (their charges are live, and a live
 * doesn't-pay depends on the carry); the closed months before that are summed flat from their rows.
 *
 * The queries are written against explicit mess ids (forMess), so the service also works outside a request.
 */
class MonthBalanceService
{
    public function __construct(private readonly Calendar $calendar) {}

    public function forMonth(Month $month): BalanceResult
    {
        return $this->snapshot($month)->balances;
    }

    public function snapshot(Month $month): MonthSnapshot
    {
        $shared = $this->shared($month->mess_id);

        $prior = Month::query()->forMess($month->mess_id)
            ->where('starts_on', '<', $month->starts_on->toDateString())
            ->orderBy('starts_on')->get();

        $firstOpen = $prior->search(fn (Month $m) => $m->status === MonthStatus::Open);
        $flat = $firstOpen === false ? $prior : $prior->slice(0, $firstOpen);
        $replay = $firstOpen === false ? collect() : $prior->slice($firstOpen);

        $carry = $this->flatBalance($month->mess_id, $flat->pluck('id')->all(), $shared['memberIds']);
        foreach ($replay as $earlier) {
            $carry = $this->build($earlier, $carry, $shared)->totals();
        }

        return $this->build($month, $carry, $shared);
    }

    /**
     * One snapshot per month of the mess, newest first. Replays the months once, oldest to newest.
     *
     * @return list<MonthSnapshot>
     */
    public function allSnapshots(Mess $mess): array
    {
        $shared = $this->shared($mess->id);
        $carry = array_fill_keys($shared['memberIds'], 0);
        $out = [];

        foreach (Month::query()->forMess($mess->id)->orderBy('starts_on')->get() as $month) {
            $snap = $this->build($month, $carry, $shared);
            $carry = $snap->totals();
            $out[] = $snap;
        }

        return array_reverse($out);
    }

    // ------------------------------------------------------------------ building one month

    /**
     * @param  array<int,int>  $carryBefore  balance before this month, every mess member
     * @param  array{mess: Mess, members: Collection, categories: Collection, memberIds: list<int>}  $s
     */
    private function build(Month $month, array $carryBefore, array $s): MonthSnapshot
    {
        $messId = $month->mess_id;
        /** @var Mess $mess */
        $mess = $s['mess'];
        /** @var Collection<int,MessMember> $members */
        $members = $s['members'];
        /** @var Collection<int,Category> $categories */
        $categories = $s['categories'];
        $memberIds = $s['memberIds'];
        $stored = $month->status === MonthStatus::Closed;
        $zero = array_fill_keys($memberIds, 0);
        $zeroGroups = [Group::Fixed->value => $zero, Group::Meals->value => $zero];

        $activeIds = $members->filter(fn (MessMember $m) => $m->isActiveIn($month))->keys()->map(fn ($id) => (int) $id)->sort()->values()->all();

        $payments = Payment::query()->forMess($messId)->where('month_id', $month->id)->orderBy('paid_on')->orderBy('id')->get();
        $expenses = Expense::query()->forMess($messId)->where('month_id', $month->id)
            ->where('status', ExpenseStatus::Approved->value)->orderBy('spent_on')->orderBy('id')->get();
        $ledgerAll = LedgerEntry::query()->forMess($messId)->where('month_id', $month->id)->whereNotNull('member_id')->orderBy('id')->get();
        $settings = MemberMonthSetting::query()->forMess($messId)->where('month_id', $month->id)->get()->keyBy('member_id');

        // Opening rows are part of the carry ("Last month due"); everything else is a line of this month.
        $openings = $zero;
        foreach ($ledgerAll->where('type', LedgerType::Opening) as $row) {
            $openings[$row->member_id] = ($openings[$row->member_id] ?? 0) + $row->amount_paisa;
        }
        $carryIn = [];
        foreach ($memberIds as $id) {
            $carryIn[$id] = ($carryBefore[$id] ?? 0) + $openings[$id];
        }
        $ledger = $ledgerAll->reject(fn (LedgerEntry $e) => $e->type === LedgerType::Opening
            || (! $stored && in_array($e->type, [LedgerType::Charge, LedgerType::Rounding], true)))->values();

        // Group maps for the engine.
        $paymentsMap = $zeroGroups;
        foreach ($payments as $p) {
            $paymentsMap[$p->group->value][$p->member_id] = ($paymentsMap[$p->group->value][$p->member_id] ?? 0) + $p->amount_paisa;
        }
        $ownPocket = $expenses->filter(fn (Expense $e) => $e->paid_by === PaidBy::Member && $e->paid_by_member_id !== null)->values();
        $ownMap = $zeroGroups;
        $expensesByGroup = [Group::Fixed->value => 0, Group::Meals->value => 0];
        $spentByCategory = [];
        foreach ($expenses as $e) {
            $group = ($categories->get($e->category_id)?->group ?? Group::Fixed)->value;
            $expensesByGroup[$group] += $e->amount_paisa;
            $spentByCategory[$e->category_id] = ($spentByCategory[$e->category_id] ?? 0) + $e->amount_paisa;
            if ($e->paid_by === PaidBy::Member && $e->paid_by_member_id !== null) {
                $ownMap[$group][$e->paid_by_member_id] = ($ownMap[$group][$e->paid_by_member_id] ?? 0) + $e->amount_paisa;
            }
        }
        $ledgerMap = $zeroGroups;
        $storedCharges = $zeroGroups;
        $roundingExtra = 0;
        foreach ($ledger as $e) {
            $group = $e->group?->value ?? Group::Fixed->value;
            if (in_array($e->type, [LedgerType::DoesntPayOut, LedgerType::DoesntPayIn], true)) {
                $group = Group::Fixed->value; // BalanceInput: stored doesn't-pay rows go on the fixed side
            }
            if ($stored && in_array($e->type, [LedgerType::Charge, LedgerType::Rounding], true)) {
                $storedCharges[$group][$e->member_id] = ($storedCharges[$group][$e->member_id] ?? 0) - $e->amount_paisa;
                if ($e->type === LedgerType::Rounding) {
                    $roundingExtra -= $e->amount_paisa;
                }

                continue;
            }
            $ledgerMap[$group][$e->member_id] = ($ledgerMap[$group][$e->member_id] ?? 0) + $e->amount_paisa;
        }

        // Charges from raw rows (engine).
        $mealsCenti = array_fill_keys($activeIds, 0);
        foreach (MealEntry::query()->forMess($messId)->where('month_id', $month->id)
            ->groupBy('member_id')->selectRaw('member_id, SUM(meals_centi) as own, SUM(guest_meals_centi) as guest')->get() as $row) {
            if (isset($mealsCenti[$row->member_id])) {
                $mealsCenti[$row->member_id] = (int) $row->own + (int) $row->guest;
            }
        }

        $billRows = MonthBill::query()->forMess($messId)->where('month_id', $month->id)->get()->keyBy('category_id');
        $overrideRows = ChargeOverride::query()->forMess($messId)->where('month_id', $month->id)->get()->groupBy('category_id');
        $active = array_flip($activeIds);
        $bills = [];
        $byMealCost = (int) $month->food_carry_in_paisa;
        foreach ($categories->sortBy([['sort', 'asc'], ['id', 'asc']]) as $category) {
            $spent = $spentByCategory[$category->id] ?? 0;
            if ($category->split_type === SplitType::ByMeal) {
                $byMealCost += $spent;

                continue;
            }
            $total = $category->group === Group::Fixed ? (int) ($billRows->get($category->id)?->amount_paisa ?? 0) : $spent;
            $overrides = [];
            foreach ($overrideRows->get($category->id, collect())->sortBy('member_id') as $o) {
                if (isset($active[$o->member_id])) { // BillSplitter rejects members outside the active list
                    $overrides[(int) $o->member_id] = (int) $o->amount_paisa;
                }
            }
            if ($total !== 0 || $overrides !== []) {
                $bills[] = new BillInput($category->id, $category->group, $category->split_type, $total, $activeIds, $overrides);
            }
        }

        $minEnabled = (bool) $mess->min_meals_enabled;
        $minMeals = [];
        foreach ($activeIds as $id) {
            $minMeals[$id] = $minEnabled ? ($settings->get($id)?->min_meals_centi ?? $mess->min_meals_centi) : null;
        }
        $meals = new MealInput(
            $byMealCost, $activeIds, $mealsCenti, $minMeals,
            $mess->min_payable_enabled ? $mess->min_payable_paisa : null,
            $month->zero_meal_resolution,
        );
        $charge = ChargeCalculator::calculate(new ChargeInput($month->id, $activeIds, $mess->rounding_mode, $bills, $meals));

        $charged = $zeroGroups;
        if ($stored) {
            $charged = $storedCharges;
        } else {
            foreach ([Group::Fixed->value, Group::Meals->value] as $g) {
                foreach ($charge->charged[$g] as $id => $v) {
                    $charged[$g][$id] = $v;
                }
            }
            $roundingExtra = $charge->totalRoundingDeltaPaisa;
        }

        $effective = $zero;
        foreach ($charge->meal->effectiveMealsCenti as $id => $v) {
            $effective[$id] = $v;
        }

        $deposit = $zero;
        foreach ($activeIds as $id) {
            $deposit[$id] = (int) ($settings->get($id)?->deposit_paisa ?? $month->deposit_paisa);
        }

        $today = $this->today($month, $stored);
        $balances = BalanceCalculator::calculate(new BalanceInput(
            $memberIds, $activeIds, $carryIn, $paymentsMap, $ownMap, $ledgerMap, $charged, $effective,
            $stored ? [] : $this->liveDoesntPay($month),
            $deposit,
            $month->fixed_deadline?->toDateString(), $month->deposit_deadline?->toDateString(), $today,
        ));

        return new MonthSnapshot(
            $month, $stored, $members, $categories, $memberIds, $activeIds, $carryIn, $charged, $balances, $charge,
            $payments, $ownPocket, $ledger, $expensesByGroup, $deposit, $mealsCenti, $byMealCost, $roundingExtra, $today,
        );
    }

    /** Pending "X doesn't pay" requests of an open month. @return list<DoesntPayRequest> */
    private function liveDoesntPay(Month $month): array
    {
        $recoverables = Recoverable::query()->forMess($month->mess_id)->where('month_id', $month->id)
            ->where('status', RecoverableStatus::Pending->value)->whereNull('undone_at')->orderBy('id')->get();
        if ($recoverables->isEmpty()) {
            return [];
        }
        $shares = RecoverableShare::query()->forMess($month->mess_id)
            ->whereIn('recoverable_id', $recoverables->pluck('id'))->get()->groupBy('recoverable_id');

        return $recoverables->map(function (Recoverable $r) use ($shares) {
            $manual = [];
            foreach ($shares->get($r->id, collect())->sortBy('member_id') as $share) {
                if ($share->manual_amount_paisa !== null) {
                    $manual[(int) $share->member_id] = (int) $share->manual_amount_paisa;
                }
            }

            return new DoesntPayRequest((int) $r->debtor_member_id, $r->mode, $manual);
        })->all();
    }

    /**
     * Balance of every member after all the given (closed) months, summed straight from the rows:
     * payments + approved own-pocket expenses + every ledger row (charge/rounding included).
     *
     * @param  list<int>  $monthIds
     * @param  list<int>  $memberIds
     * @return array<int,int>
     */
    private function flatBalance(int $messId, array $monthIds, array $memberIds): array
    {
        $out = array_fill_keys($memberIds, 0);
        if ($monthIds === []) {
            return $out;
        }

        $sums = [
            Payment::query()->forMess($messId)->whereIn('month_id', $monthIds)
                ->groupBy('member_id')->selectRaw('member_id as m, SUM(amount_paisa) as s')->pluck('s', 'm'),
            Expense::query()->forMess($messId)->whereIn('month_id', $monthIds)
                ->where('status', ExpenseStatus::Approved->value)->where('paid_by', PaidBy::Member->value)->whereNotNull('paid_by_member_id')
                ->groupBy('paid_by_member_id')->selectRaw('paid_by_member_id as m, SUM(amount_paisa) as s')->pluck('s', 'm'),
            LedgerEntry::query()->forMess($messId)->whereIn('month_id', $monthIds)->whereNotNull('member_id')
                ->groupBy('member_id')->selectRaw('member_id as m, SUM(amount_paisa) as s')->pluck('s', 'm'),
        ];
        foreach ($sums as $sum) {
            foreach ($sum as $id => $value) {
                $out[(int) $id] = ($out[(int) $id] ?? 0) + (int) $value;
            }
        }
        ksort($out);

        return $out;
    }

    /** @return array{mess: Mess, members: Collection, categories: Collection, memberIds: list<int>} */
    private function shared(int $messId): array
    {
        $members = MessMember::query()->forMess($messId)->orderBy('id')->get()->keyBy('id');

        return [
            'mess' => Mess::query()->findOrFail($messId),
            'members' => $members,
            'categories' => Category::query()->forMess($messId)->orderBy('sort')->orderBy('id')->get()->keyBy('id'),
            'memberIds' => $members->keys()->map(fn ($id) => (int) $id)->all(),
        ];
    }

    /** Overdue is measured against today; a closed month is judged as of the day it closed. */
    private function today(Month $month, bool $stored): string
    {
        if (! $stored) {
            return $this->calendar->today()->toDateString();
        }

        return $month->closed_at?->copy()->timezone(config('app.timezone'))->toDateString() ?? $month->ends_on->toDateString();
    }
}
