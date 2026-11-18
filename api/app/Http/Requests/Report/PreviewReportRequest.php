<?php

namespace App\Http\Requests\Report;

use App\Http\Requests\Lifecycle\CloseMonthRequest;
use App\Enums\SplitType;
use Illuminate\Validation\Rule;

/** The close popup's answers (zero-meal choice, this month's bill edits) plus next month's whole Fixed-bill list. */
class PreviewReportRequest extends CloseMonthRequest
{
    public function rules(): array
    {
        return parent::rules() + [
            'next_bills' => ['sometimes', 'array', 'max:100'],
            'next_bills.*' => ['array'],
            'next_bills.*.category_id' => ['nullable', 'integer'],
            'next_bills.*.name' => ['required_without:next_bills.*.category_id', 'string', 'max:100'],
            'next_bills.*.split_type' => ['required_without:next_bills.*.category_id', Rule::in([SplitType::Equal->value, SplitType::FixedPerPerson->value])],
            'next_bills.*.amount_paisa' => ['sometimes', 'integer', 'min:0', 'max:9000000000000'],
            'next_bills.*.overrides' => ['sometimes', 'array', 'max:500'],
            'next_bills.*.overrides.*' => ['array:member_id,amount_paisa'],
            'next_bills.*.overrides.*.member_id' => ['required', 'integer', 'distinct'],
            'next_bills.*.overrides.*.amount_paisa' => ['required', 'integer', 'min:0', 'max:9000000000000'],
        ];
    }

    /** @return list<array<string,mixed>> */
    public function nextBills(): array
    {
        return array_values($this->validated('next_bills') ?? []);
    }
}
