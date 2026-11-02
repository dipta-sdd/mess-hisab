<?php

namespace App\Http\Requests\Meal;

use App\Services\Meal\MealRules;
use Illuminate\Foundation\Http\FormRequest;

class MealBulkRequest extends FormRequest
{
    public function authorize(): bool
    {
        MealRules::assertTracking(currentMess());

        return true;
    }

    public function rules(): array
    {
        return [
            'entries' => ['required', 'array', 'min:1', 'max:'.MealRules::MAX_BULK_ENTRIES],
            'entries.*' => ['array'],
        ] + MealRules::entry(currentMess(), 'entries.*.');
    }
}
