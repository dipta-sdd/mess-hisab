<?php

namespace App\Http\Requests\Member;

use Illuminate\Foundation\Http\FormRequest;

class StoreMemberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'display_name' => ['required', 'string', 'max:100'],
            'joined_on' => ['required', 'date_format:Y-m-d'],
            'opening_balance_paisa' => ['sometimes', 'nullable', 'integer'],
        ];
    }
}
