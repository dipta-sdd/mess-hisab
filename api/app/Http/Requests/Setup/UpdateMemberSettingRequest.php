<?php

namespace App\Http\Requests\Setup;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** PUT /months/{month}/members/{member}/settings. A key sent as null clears that override; an absent key is untouched. */
class UpdateMemberSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'deposit_paisa' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:9000000000000'],
            'min_meals_centi' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $v) {
            if (! $this->hasAny(['deposit_paisa', 'min_meals_centi'])) {
                $v->errors()->add('deposit_paisa', 'Send at least one of deposit_paisa, min_meals_centi.');
            }
        }];
    }
}
