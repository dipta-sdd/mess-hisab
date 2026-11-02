<?php

namespace App\Http\Requests\Setup;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * PATCH /months/{month}/setup. Deadlines may be null (clears it). A deadline cannot be before the month starts
 * ("within or after the month"), and at most one year after it ends (catches typos such as 2062).
 */
class UpdateSetupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $month = $this->route('month');
        $min = $month->starts_on->toDateString();
        $max = $month->ends_on->copy()->addYear()->toDateString();

        return [
            'fixed_deadline' => ['sometimes', 'nullable', 'date_format:Y-m-d', "after_or_equal:{$min}", "before_or_equal:{$max}"],
            'deposit_deadline' => ['sometimes', 'nullable', 'date_format:Y-m-d', "after_or_equal:{$min}", "before_or_equal:{$max}"],
            'deposit_paisa' => ['sometimes', 'integer', 'min:0', 'max:9000000000000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $v) {
            if (! $this->hasAny(['fixed_deadline', 'deposit_deadline', 'deposit_paisa'])) {
                $v->errors()->add('fixed_deadline', 'Send at least one of fixed_deadline, deposit_deadline, deposit_paisa.');
            }
        }];
    }
}
