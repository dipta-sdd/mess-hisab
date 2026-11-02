<?php

namespace App\Http\Requests\Lifecycle;

use App\Enums\Group;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'member_id' => ['required', 'integer', Rule::exists('mess_members', 'id')->where('mess_id', currentMess()->id)],
            'group' => ['required', Rule::in(Group::values())],
            // Signed: + credit, - due. Zero is not an adjustment.
            'amount_paisa' => ['required', 'integer', 'not_in:0', 'between:-9000000000000,9000000000000'],
            'note' => ['required', 'string', 'max:500'],
        ];
    }
}
