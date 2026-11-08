<?php

namespace App\Http\Requests\Lifecycle;

use App\Enums\SplitType;
use App\Enums\ZeroMealResolution;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Close (body) and close-preview (body) take the optional zero-meal choice and, optionally, fixed-bill
 * edits applied in the same transaction as the close: `bills` is a list of
 * {category_id, amount_paisa?, overrides?} for existing bills, or {name, split_type, amount_paisa?, overrides?}
 * (no category_id) for a new fixed bill. close-check (query) only takes the choice.
 */
class CloseMonthRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'zero_meal_resolution' => ['sometimes', 'nullable', Rule::in(ZeroMealResolution::values())],
            'bills' => ['sometimes', 'array', 'max:100'],
            'bills.*' => ['array'],
            'bills.*.category_id' => ['nullable', 'integer'],
            'bills.*.name' => ['required_without:bills.*.category_id', 'string', 'max:100'],
            'bills.*.split_type' => ['required_without:bills.*.category_id', Rule::in([SplitType::Equal->value, SplitType::FixedPerPerson->value])],
            'bills.*.amount_paisa' => ['sometimes', 'integer', 'min:0', 'max:9000000000000'],
            'bills.*.overrides' => ['sometimes', 'array', 'max:500'],
            'bills.*.overrides.*' => ['array:member_id,amount_paisa'],
            'bills.*.overrides.*.member_id' => ['required', 'integer', 'distinct'],
            'bills.*.overrides.*.amount_paisa' => ['required', 'integer', 'min:0', 'max:9000000000000'],
        ];
    }

    /** @return list<array<string,mixed>> */
    public function billEdits(): array
    {
        return array_values($this->validated('bills') ?? []);
    }

    public function resolution(): ?ZeroMealResolution
    {
        $v = $this->validated('zero_meal_resolution');

        return $v === null ? null : ZeroMealResolution::from($v);
    }
}
