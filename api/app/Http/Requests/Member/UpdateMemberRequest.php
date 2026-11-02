<?php

namespace App\Http\Requests\Member;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateMemberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'display_name' => ['sometimes', 'required', 'string', 'max:100'],
            'joined_on' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'left_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            $member = $this->route('member');
            $joined = $this->has('joined_on') ? $this->input('joined_on') : $member?->joined_on?->toDateString();
            $left = $this->has('left_on') ? $this->input('left_on') : $member?->left_on?->toDateString();
            if ($joined && $left && $left < $joined) {
                $validator->errors()->add('left_on', 'The left on date must be on or after the joined on date.');
            }
        }];
    }
}
