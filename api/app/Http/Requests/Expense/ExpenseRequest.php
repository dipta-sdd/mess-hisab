<?php

namespace App\Http\Requests\Expense;

use App\Enums\PaidBy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Create (core fields required) and update (all optional) share the same rules. */
class ExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';
        $messId = currentMess()->id;

        return [
            'category_id' => [$req, 'integer', Rule::exists('categories', 'id')->where('mess_id', $messId)->whereNull('archived_at')],
            'amount_paisa' => [$req, 'integer', 'min:1', 'max:9000000000000'],
            'spent_on' => [$req, 'date_format:Y-m-d'],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
            'paid_by' => [$req, Rule::in(PaidBy::values())],
            'paid_by_member_id' => ['sometimes', 'nullable', 'integer', Rule::exists('mess_members', 'id')->where('mess_id', $messId)->whereNull('archived_at')],
        ];
    }
}
