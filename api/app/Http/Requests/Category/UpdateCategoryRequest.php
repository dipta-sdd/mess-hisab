<?php

namespace App\Http\Requests\Category;

use App\Enums\SplitType;
use App\Models\Category;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateCategoryRequest extends StoreCategoryRequest
{
    public function rules(): array
    {
        /** @var Category $category */
        $category = $this->route('category');

        return [
            // A category's group never changes: its bills and expenses are tied to it.
            'group' => ['prohibited'],
            'name' => ['sometimes', 'required', 'string', 'max:100', $this->uniqueName($category, $category->group)],
            'split_type' => ['sometimes', 'required', Rule::enum(SplitType::class)],
            'sort' => ['sometimes', 'integer', 'between:0,100000'],
        ];
    }

    public function after(): array
    {
        /** @var Category $category */
        $category = $this->route('category');

        return [fn (Validator $v) => self::checkMealsSplit(
            $v,
            $category->group->value,
            $this->input('split_type', $category->split_type->value),
        )];
    }
}
