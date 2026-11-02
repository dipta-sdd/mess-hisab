<?php

namespace App\Http\Requests\Meal;

use App\Services\Meal\MealRules;
use Illuminate\Foundation\Http\FormRequest;

class MealUpsertRequest extends FormRequest
{
    /** Tracking off is a 409 before payload validation. Who-may-write is checked by MealWriter. */
    public function authorize(): bool
    {
        MealRules::assertTracking(currentMess());

        return true;
    }

    public function rules(): array
    {
        return MealRules::entry(currentMess());
    }
}
