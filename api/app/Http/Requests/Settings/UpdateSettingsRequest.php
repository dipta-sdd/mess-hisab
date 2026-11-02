<?php

namespace App\Http\Requests\Settings;

use App\Enums\MealEntryBy;
use App\Enums\MealTracking;
use App\Enums\RoundingMode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSettingsRequest extends FormRequest
{
    public const FIELDS = [
        'name', 'currency', 'month_start_day', 'approval_required', 'rounding_mode', 'meal_tracking',
        'meal_entry_by', 'breakfast_weight_centi', 'lunch_weight_centi', 'dinner_weight_centi',
        'min_meals_enabled', 'min_meals_centi', 'min_payable_enabled', 'min_payable_paisa',
        'deposit_paisa', 'fixed_due_day_offset', 'deposit_due_day_offset',
    ];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'currency' => ['sometimes', 'required', 'string', 'size:3', 'alpha'],
            'month_start_day' => ['sometimes', 'required', 'integer', 'between:1,28'],
            'approval_required' => ['sometimes', 'required', 'boolean'],
            'rounding_mode' => ['sometimes', 'required', Rule::enum(RoundingMode::class)],
            'meal_tracking' => ['sometimes', 'required', Rule::enum(MealTracking::class)],
            'meal_entry_by' => ['sometimes', 'required', Rule::enum(MealEntryBy::class)],
            'breakfast_weight_centi' => ['sometimes', 'required', 'integer', 'between:0,1000'],
            'lunch_weight_centi' => ['sometimes', 'required', 'integer', 'between:0,1000'],
            'dinner_weight_centi' => ['sometimes', 'required', 'integer', 'between:0,1000'],
            'min_meals_enabled' => ['sometimes', 'required', 'boolean'],
            'min_meals_centi' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'min_payable_enabled' => ['sometimes', 'required', 'boolean'],
            'min_payable_paisa' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'deposit_paisa' => ['sometimes', 'required', 'integer', 'min:0'],
            'fixed_due_day_offset' => ['sometimes', 'required', 'integer', 'between:1,31'],
            'deposit_due_day_offset' => ['sometimes', 'required', 'integer', 'between:1,31'],
        ];
    }
}
