<?php

namespace App\Http\Requests\Export;

use App\Enums\ExportType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Shape only. Whether the month/member belong to this mess is a 404 in the controller. */
class StoreExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // any member; membership is enforced by the `mess` middleware
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(ExportType::values())],
            'month_id' => ['required', 'integer', 'min:1'],
            'member_id' => ['nullable', 'integer', 'min:1', Rule::requiredIf($this->input('type') === ExportType::Statement->value)],
        ];
    }
}
