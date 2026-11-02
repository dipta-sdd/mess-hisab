<?php

namespace App\Http\Requests\Mess;

use Illuminate\Foundation\Http\FormRequest;

class StoreMessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'month_start_day' => ['sometimes', 'nullable', 'integer', 'between:1,28'],
            'first_month_starts_on' => ['required', 'date_format:Y-m-d'],
            'creator_display_name' => ['required', 'string', 'max:100'],
            'creator_opening_balance_paisa' => ['sometimes', 'nullable', 'integer'],
            'members' => ['sometimes', 'nullable', 'array', 'max:50'],
            'members.*.display_name' => ['required', 'string', 'max:100'],
            'members.*.opening_balance_paisa' => ['sometimes', 'nullable', 'integer'],
        ];
    }
}
