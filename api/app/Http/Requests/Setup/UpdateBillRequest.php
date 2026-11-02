<?php

namespace App\Http\Requests\Setup;

use App\Enums\Group;
use App\Enums\SplitType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * PUT /months/{month}/bills/{category}. `amount_paisa` is for the fixed group only (a meals bill's total is
 * its approved expenses). `overrides`, when sent, replaces the whole set; when omitted it is left alone.
 * Overrides must name members active in the month, once each. A by_meal category has no overrides.
 */
class UpdateBillRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'amount_paisa' => ['sometimes', 'integer', 'min:0', 'max:9000000000000'],
            'overrides' => ['sometimes', 'array', 'max:500'],
            'overrides.*' => ['array:member_id,amount_paisa'],
            'overrides.*.member_id' => ['required', 'integer', 'distinct'],
            'overrides.*.amount_paisa' => ['required', 'integer', 'min:0', 'max:9000000000000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $v) {
            $category = $this->route('category');
            $month = $this->route('month');

            if ($this->has('amount_paisa') && $category->group !== Group::Fixed) {
                $v->errors()->add('amount_paisa', 'Only fixed-group bills have an amount; a meals bill is its approved expenses.');
            }

            $overrides = $this->input('overrides', []);
            if (! is_array($overrides) || $overrides === []) {
                return;
            }
            if ($category->split_type === SplitType::ByMeal) {
                $v->errors()->add('overrides', 'A by-meal category has no per-person overrides.');

                return;
            }

            $active = app(\App\Services\Setup\BillSetup::class)->activeMemberIds($month);
            foreach ($overrides as $i => $row) {
                // `integer` also accepts "5", so normalise before checking (overrideMap casts the same way).
                $id = is_array($row) ? filter_var($row['member_id'] ?? null, FILTER_VALIDATE_INT) : false;
                if ($id !== false && ! in_array($id, $active, true)) {
                    $v->errors()->add("overrides.{$i}.member_id", 'This member is not active in this month.');
                }
            }
        }];
    }

    /** @return array<int,int>|null [memberId => paisa] or null when `overrides` was not sent */
    public function overrideMap(): ?array
    {
        if (! $this->has('overrides')) {
            return null;
        }

        return collect($this->validated('overrides'))->mapWithKeys(fn ($r) => [(int) $r['member_id'] => (int) $r['amount_paisa']])->all();
    }
}
