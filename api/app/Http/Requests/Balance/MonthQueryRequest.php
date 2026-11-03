<?php

namespace App\Http\Requests\Balance;

use Illuminate\Foundation\Http\FormRequest;

/** `?month_id=` is optional; without it the controller picks today's month. `?scope=own` narrows staff to their own row. */
class MonthQueryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // membership is enforced by the `mess` middleware
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return ['month_id' => ['sometimes', 'integer', 'min:1'], 'scope' => ['sometimes', 'in:own']];
    }
}
