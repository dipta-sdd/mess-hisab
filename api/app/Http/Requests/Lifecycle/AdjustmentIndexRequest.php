<?php

namespace App\Http\Requests\Lifecycle;

use Illuminate\Foundation\Http\FormRequest;

class AdjustmentIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'month_id' => ['sometimes', 'integer'],
            'member_id' => ['sometimes', 'integer'],
        ];
    }
}
