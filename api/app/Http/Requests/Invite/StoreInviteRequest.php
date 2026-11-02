<?php

namespace App\Http\Requests\Invite;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreInviteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Must be an unclaimed, unarchived placeholder of this mess.
            'member_id' => ['sometimes', 'nullable', 'integer', Rule::exists('mess_members', 'id')
                ->where('mess_id', currentMess()?->id)
                ->whereNull('user_id')
                ->whereNull('archived_at')],
            'expires_in_days' => ['sometimes', 'nullable', 'integer', 'between:1,365'],
            'max_uses' => ['sometimes', 'nullable', 'integer', 'between:1,1000'],
        ];
    }

    public function messages(): array
    {
        return ['member_id.exists' => 'The member must be an unclaimed placeholder of this mess.'];
    }
}
