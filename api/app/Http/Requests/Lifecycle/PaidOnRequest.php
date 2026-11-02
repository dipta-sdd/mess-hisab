<?php

namespace App\Http\Requests\Lifecycle;

use Illuminate\Foundation\Http\FormRequest;

/** `{amount_paisa, paid_on}`: repayments and final settlement. */
class PaidOnRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'amount_paisa' => ['required', 'integer', 'min:1', 'max:9000000000000'],
            'paid_on' => ['required', 'date_format:Y-m-d'],
        ];
    }
}
