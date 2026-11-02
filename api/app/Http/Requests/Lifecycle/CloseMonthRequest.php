<?php

namespace App\Http\Requests\Lifecycle;

use App\Enums\ZeroMealResolution;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Close (body) and close-check (query) both take the optional zero-meal choice. */
class CloseMonthRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['zero_meal_resolution' => ['sometimes', 'nullable', Rule::in(ZeroMealResolution::values())]];
    }

    public function resolution(): ?ZeroMealResolution
    {
        $v = $this->validated('zero_meal_resolution');

        return $v === null ? null : ZeroMealResolution::from($v);
    }
}
