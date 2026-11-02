<?php

namespace App\Http\Requests\Lifecycle;

use App\Enums\DoesntPayMode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DoesntPayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $member = Rule::exists('mess_members', 'id')->where('mess_id', currentMess()->id);

        return [
            'member_id' => ['required', 'integer', $member],
            'mode' => ['required', Rule::in(DoesntPayMode::values())],
            'manual' => ['sometimes', 'nullable', 'array', 'max:200'],
            'manual.*.member_id' => ['required', 'integer', $member],
            'manual.*.amount_paisa' => ['required', 'integer', 'min:0', 'max:9000000000000'],
        ];
    }
}
