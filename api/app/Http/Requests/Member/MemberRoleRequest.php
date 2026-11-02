<?php

namespace App\Http\Requests\Member;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Body of POST admin / POST manager: a member of this mess that has an account and is not archived. */
class MemberRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'member_id' => ['required', 'integer', Rule::exists('mess_members', 'id')
                ->where('mess_id', currentMess()?->id)
                ->whereNotNull('user_id')
                ->whereNull('archived_at')],
        ];
    }

    public function messages(): array
    {
        return ['member_id.exists' => 'The member must belong to this mess, have an account and not be archived.'];
    }
}
