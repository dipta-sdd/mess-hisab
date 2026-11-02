<?php

namespace App\Services\Setup;

use App\Billing\Dto\BillInput;
use App\Billing\Split\BillSplitter;
use App\Billing\Split\LargestRemainder;
use App\Enums\ExpenseStatus;
use App\Enums\Group;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\ChargeOverride;
use App\Models\Expense;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\MonthBill;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Task H: reads and writes one month's bill setup. Splitting is always BillSplitter / LargestRemainder.
 * Every write runs in a transaction that locks the month row and refuses a closed month (409 month_closed).
 *
 * A "bill view" is the array behind BillResource:
 * [category_id, group, split_type, amount_paisa, overrides[], shares[], unallocated_paisa, unallocated_accepted].
 */
class BillSetup
{
    /** Member ids active in the month (CONTRACT §3), ascending. Archived members count if they were active then. */
    public function activeMemberIds(Month $month): array
    {
        return MessMember::query()->activeIn($month)->orderBy('id')->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return list<array> bill views for every non-archived category, in category order */
    public function billsFor(Month $month): array
    {
        $categories = Category::query()->whereNull('archived_at')->orderBy('sort')->orderBy('id')->get();
        $rows = MonthBill::query()->where('month_id', $month->id)->get()->keyBy('category_id');
        $overrides = ChargeOverride::query()->where('month_id', $month->id)->get()->groupBy('category_id');
        $spent = $this->approvedExpenseTotals($month);
        $members = $this->activeMemberIds($month);

        return $categories->map(fn (Category $c) => $this->view(
            $c, $rows->get($c->id), $overrides->get($c->id, collect()), $spent[$c->id] ?? 0, $members
        ))->all();
    }

    public function billFor(Month $month, Category $category): array
    {
        $row = MonthBill::query()->where('month_id', $month->id)->where('category_id', $category->id)->first();
        $overrides = ChargeOverride::query()->where('month_id', $month->id)->where('category_id', $category->id)->get();
        $spent = $category->group === Group::Meals ? ($this->approvedExpenseTotals($month)[$category->id] ?? 0) : 0;

        return $this->view($category, $row, $overrides, $spent, $this->activeMemberIds($month));
    }

    /**
     * Change the amount (fixed group only) and/or replace the whole override set.
     *
     * @param  int|null  $amount  null = leave the amount as is
     * @param  array<int,int>|null  $overrides  [memberId => paisa]; null = leave as is
     */
    public function save(Month $month, Category $category, ?int $amount, ?array $overrides): array
    {
        return $this->locked($month, function (Month $month) use ($category, $amount, $overrides) {
            $this->assertCategoryUsable($category);
            $row = $this->row($month, $category);

            if ($amount !== null) {
                $row->amount_paisa = $amount;
            }
            if ($category->group === Group::Fixed && $row->amount_paisa === null) {
                throw new SetupException(__('A fixed bill needs its amount first.'), 'amount_required');
            }
            // Any change to amount or overrides invalidates an earlier "accept the unallocated amount".
            $row->unallocated_accepted = false;
            $row->save();

            if ($overrides !== null) {
                $this->replaceOverrides($month, $category, $overrides);
            }

            return $this->billFor($month, $category);
        });
    }

    /**
     * Spread the unallocated amount equally (largest remainder, lowest member id gets the extra paisa)
     * over the members without an override; when every member already has an amount, over everyone on
     * top of their current share. (For an equal bill the members without an override already share the
     * remainder, so this only matters for fixed_per_person or when everyone is overridden.)
     * Only a positive unallocated amount can be spread; over-allocation is refused (409 over_allocated).
     * The result is written as overrides, so unallocated becomes exactly 0.
     */
    public function spread(Month $month, Category $category): array
    {
        return $this->locked($month, function (Month $month) use ($category) {
            $this->assertCategoryUsable($category);
            $bill = $this->billFor($month, $category);
            $unallocated = $bill['unallocated_paisa'];

            if ($unallocated === 0) {
                throw new SetupException(__('Nothing is unallocated.'), 'nothing_to_spread');
            }
            if ($unallocated < 0) {
                throw new SetupException(__('The bill is over-allocated; lower someone\'s amount or raise the bill.'), 'over_allocated');
            }

            $members = $this->activeMemberIds($month);
            $overridden = array_flip(array_column($bill['overrides'], 'member_id'));
            $targets = array_values(array_filter($members, fn ($id) => ! isset($overridden[$id])));
            if ($targets === []) {
                $targets = $members;
            }
            if ($targets === []) {
                throw new SetupException(__('There are no members to spread over.'), 'nothing_to_spread');
            }

            foreach (LargestRemainder::split($unallocated, array_fill_keys($targets, 1)) as $memberId => $part) {
                ChargeOverride::updateOrCreate(
                    ['month_id' => $month->id, 'category_id' => $category->id, 'member_id' => $memberId],
                    ['mess_id' => $month->mess_id, 'amount_paisa' => ($bill['shares'][$memberId] ?? 0) + $part],
                );
            }

            $row = $this->row($month, $category);
            $row->unallocated_accepted = false;
            $row->save();

            return $this->billFor($month, $category);
        });
    }

    public function accept(Month $month, Category $category): array
    {
        return $this->locked($month, function (Month $month) use ($category) {
            $this->assertCategoryUsable($category);
            $row = $this->row($month, $category);
            $row->unallocated_accepted = true;
            $row->save();

            return $this->billFor($month, $category);
        });
    }

    /** Runs $work in a transaction holding a lock on the month; 409 month_closed if it is closed. */
    public function locked(Month $month, callable $work): mixed
    {
        return DB::transaction(function () use ($month, $work) {
            $locked = Month::query()->whereKey($month->id)->lockForUpdate()->firstOrFail();
            if (! $locked->isOpen()) {
                throw new HttpResponseException(response()->json([
                    'message' => __('This month is closed.'), 'code' => 'month_closed',
                ], 409));
            }

            return $work($locked);
        });
    }

    private function assertCategoryUsable(Category $category): void
    {
        if ($category->archived_at !== null) {
            throw new SetupException(__('This category is archived.'), 'category_archived');
        }
    }

    private function row(Month $month, Category $category): MonthBill
    {
        return MonthBill::query()->firstOrNew(
            ['month_id' => $month->id, 'category_id' => $category->id],
            ['mess_id' => $month->mess_id, 'unallocated_accepted' => false],
        );
    }

    /** @param array<int,int> $overrides [memberId => paisa] */
    private function replaceOverrides(Month $month, Category $category, array $overrides): void
    {
        $existing = ChargeOverride::query()->where('month_id', $month->id)->where('category_id', $category->id)->get()->keyBy('member_id');

        foreach ($existing as $memberId => $row) {
            if (! array_key_exists($memberId, $overrides)) {
                $row->delete();
            }
        }
        foreach ($overrides as $memberId => $paisa) {
            $row = $existing->get($memberId);
            if ($row === null) {
                ChargeOverride::create([
                    'mess_id' => $month->mess_id, 'month_id' => $month->id, 'category_id' => $category->id,
                    'member_id' => $memberId, 'amount_paisa' => $paisa,
                ]);
            } elseif ($row->amount_paisa !== $paisa) {
                $row->update(['amount_paisa' => $paisa]);
            }
        }
    }

    /** @return array<int,int> category_id => Σ approved, non-deleted expenses in the month */
    private function approvedExpenseTotals(Month $month): array
    {
        return Expense::query()
            ->where('month_id', $month->id)
            ->where('status', ExpenseStatus::Approved->value)
            ->groupBy('category_id')
            ->selectRaw('category_id, SUM(amount_paisa) as total')
            ->pluck('total', 'category_id')
            ->map(fn ($v) => (int) $v)
            ->all();
    }

    /** @param Collection<int,ChargeOverride> $overrides */
    private function view(Category $category, ?MonthBill $row, Collection $overrides, int $spent, array $members): array
    {
        $total = $category->group === Group::Fixed ? (int) ($row?->amount_paisa ?? 0) : $spent;
        $list = $overrides->sortBy('member_id')->map(fn (ChargeOverride $o) => [
            'member_id' => (int) $o->member_id, 'amount_paisa' => (int) $o->amount_paisa,
        ])->values()->all();

        $shares = [];
        $unallocated = 0;
        // by_meal shares come from the meal engine (task J), not from here: no shares, nothing unallocated.
        if ($category->split_type !== SplitType::ByMeal) {
            // An override of a member who is no longer active in the month (e.g. dates edited later) is listed
            // but ignored when splitting, because BillSplitter rejects members outside the active list.
            $active = array_flip($members);
            $effective = [];
            foreach ($list as $o) {
                if (isset($active[$o['member_id']])) {
                    $effective[$o['member_id']] = $o['amount_paisa'];
                }
            }
            $split = BillSplitter::split(new BillInput(
                $category->id, $category->group, $category->split_type, $total, $members, $effective,
            ));
            $shares = $split->shares;
            $unallocated = $split->unallocatedPaisa;
        }

        return [
            'category_id' => $category->id,
            'group' => $category->group->value,
            'split_type' => $category->split_type->value,
            'amount_paisa' => $total,
            'overrides' => $list,
            'shares' => $shares,
            'unallocated_paisa' => $unallocated,
            'unallocated_accepted' => (bool) ($row?->unallocated_accepted ?? false),
        ];
    }
}
