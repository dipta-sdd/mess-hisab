<?php

namespace App\Http\Requests\Audit;

use App\Models\MessMember;
use Illuminate\Foundation\Http\FormRequest;

class AuditIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // any member of the mess (the `mess` middleware already 404s non-members)
    }

    public function rules(): array
    {
        return [
            // Exact event ("expense.created") or, with a trailing dot, a prefix ("expense.").
            'event' => ['sometimes', 'string', 'max:100', 'regex:/^[a-z0-9_.]+$/'],
            'member_id' => ['sometimes', 'integer', function ($attribute, $value, $fail) {
                // MessMember is mess-scoped by the global scope; archived members included.
                if (! MessMember::query()->whereKey($value)->exists()) {
                    $fail('The selected member does not belong to this mess.');
                }
            }],
            'from' => ['sometimes', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:from'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
