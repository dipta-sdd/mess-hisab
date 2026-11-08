<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\Group;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Setup\BillSetup;
use App\Services\Setup\SetupException;

/**
 * Fixed-bill edits made in the close popup. Applied by the caller inside the same transaction as the close
 * (or inside the rolled-back preview), so nothing is kept unless the close succeeds. Every write goes
 * through BillSetup, so the rules are the ones of the Fixed bills page. A new bill is a fixed category
 * that stays for every later month.
 */
class CloseBillEdits
{
    public function __construct(private readonly BillSetup $bills) {}

    /** @param  list<array<string,mixed>>  $edits */
    public function apply(Mess $mess, Month $month, array $edits): void
    {
        if ($edits === []) {
            return;
        }

        $members = $this->bills->activeMemberIds($month);
        $seen = [];
        foreach ($edits as $edit) {
            $category = isset($edit['category_id']) ? $this->existing($mess, (int) $edit['category_id']) : $this->create($mess, $edit);
            if (isset($seen[$category->id])) {
                throw new SetupException(__('A bill appears twice in the changes.'), 'duplicate_bill');
            }
            $seen[$category->id] = true;

            $overrides = isset($edit['overrides'])
                ? collect($edit['overrides'])->mapWithKeys(fn ($r) => [(int) $r['member_id'] => (int) $r['amount_paisa']])->all()
                : null;
            if ($overrides !== null && $overrides !== []) {
                if ($category->split_type === SplitType::ByMeal) {
                    throw new SetupException(__('A by-meal category has no per-person amounts.'), 'invalid_override');
                }
                if (array_diff(array_keys($overrides), $members) !== []) {
                    throw new SetupException(__('This member is not active in this month.'), 'invalid_override');
                }
            }

            $amount = array_key_exists('amount_paisa', $edit) ? (int) $edit['amount_paisa'] : null;
            if ($amount !== null && $category->group !== Group::Fixed) {
                throw new SetupException(__('Only fixed bills have an amount.'), 'invalid_bill');
            }
            if ($amount !== null || $overrides !== null) {
                $this->bills->save($month, $category, $amount, $overrides);
            }
        }
    }

    private function existing(Mess $mess, int $id): Category
    {
        $category = Category::query()->forMess($mess->id)->whereNull('archived_at')->find($id);
        if ($category === null) {
            throw new SetupException(__('That bill does not exist.'), 'invalid_bill');
        }

        return $category;
    }

    /** @param  array<string,mixed>  $edit */
    private function create(Mess $mess, array $edit): Category
    {
        $name = trim((string) $edit['name']);
        $taken = Category::query()->forMess($mess->id)->where('group', Group::Fixed->value)->whereNull('archived_at')
            ->whereRaw('lower(name) = ?', [mb_strtolower($name)])->exists();
        if ($name === '' || $taken) {
            throw new SetupException(__('A fixed bill with this name already exists.'), 'name_taken');
        }

        return Category::create([
            'mess_id' => $mess->id,
            'group' => Group::Fixed->value,
            'name' => $name,
            'split_type' => $edit['split_type'],
            'sort' => (int) Category::query()->forMess($mess->id)->max('sort') + 1,
            'is_default' => false,
        ])->fresh();
    }
}
