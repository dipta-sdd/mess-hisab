<?php

namespace App\Http\Requests\Payment;

use App\Enums\Group;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Create (all required) and update (all optional) share the same rules. */
class PaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'member_id' => [$req, 'integer', Rule::exists('mess_members', 'id')->where('mess_id', currentMess()->id)],
            'group' => [$req, Rule::in(Group::values())],
            'amount_paisa' => [$req, 'integer', 'min:1', 'max:9000000000000'],
            'paid_on' => [$req, 'date_format:Y-m-d'],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
