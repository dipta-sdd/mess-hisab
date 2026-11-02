<?php

namespace App\Http\Requests\Category;

use App\Enums\Group;
use App\Enums\MealTracking;
use App\Enums\SplitType;
use App\Models\Category;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'group' => ['required', Rule::enum(Group::class)],
            'name' => ['required', 'string', 'max:100', $this->uniqueName()],
            'split_type' => ['required', Rule::enum(SplitType::class)],
            'sort' => ['sometimes', 'integer', 'between:0,100000'],
        ];
    }

    public function after(): array
    {
        return [fn (Validator $v) => self::checkMealsSplit($v, $this->input('group'), $this->input('split_type'))];
    }

    /** Active category names are unique per group, case-insensitive. */
    protected function uniqueName(?Category $ignore = null, ?Group $group = null): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($ignore, $group) {
            $group ??= Group::tryFrom((string) $this->input('group'));
            if ($group === null || ! is_string($value)) {
                return;
            }

            $taken = Category::query()
                ->where('group', $group->value)
                ->whereNull('archived_at')
                ->whereRaw('lower(name) = ?', [mb_strtolower(trim($value))])
                ->when($ignore, fn ($q) => $q->whereKeyNot($ignore->id))
                ->exists();

            if ($taken) {
                $fail('A category with this name already exists in this group.');
            }
        };
    }

    /**
     * With meal tracking off there is nothing to split by meal: Meals categories may only be
     * `equal` or `fixed_per_person`. (by_meal in the Fixed group is a 409 in the controller.)
     */
    public static function checkMealsSplit(Validator $v, mixed $group, mixed $splitType): void
    {
        if ($v->errors()->has('split_type') || $group !== Group::Meals->value) {
            return;
        }
        if ($splitType === SplitType::ByMeal->value && currentMess()?->meal_tracking === MealTracking::Off) {
            $v->errors()->add('split_type', 'Meal tracking is off, so a Meals category can only be split equally or as a fixed amount per person.');
        }
    }
}
