<?php

namespace App\Http\Controllers\Category;

use App\Enums\Group;
use App\Enums\SplitType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Category\StoreCategoryRequest;
use App\Http\Requests\Category\UpdateCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Models\Mess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CategoryController extends Controller
{
    /** Active categories; `?include_archived=1` adds archived ones (history still refers to them). */
    public function index(Request $request, Mess $mess): AnonymousResourceCollection
    {
        $categories = Category::query()
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->whereNull('archived_at'))
            ->orderBy('sort')->orderBy('id')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function store(StoreCategoryRequest $request, Mess $mess): JsonResponse
    {
        $data = $request->validated();

        if ($response = $this->byMealInFixed($data['group'], $data['split_type'])) {
            return $response;
        }

        $category = Category::create([
            'mess_id' => $mess->id,
            'group' => $data['group'],
            'name' => trim($data['name']),
            'split_type' => $data['split_type'],
            'sort' => $data['sort'] ?? ((int) Category::query()->max('sort') + 1),
            'is_default' => false,
        ]);

        return (new CategoryResource($category->fresh()))->response()->setStatusCode(201);
    }

    public function update(UpdateCategoryRequest $request, Mess $mess, Category $category): CategoryResource|JsonResponse
    {
        if ($category->archived_at !== null) {
            return response()->json(['message' => __('This category is archived.'), 'code' => 'category_archived'], 409);
        }

        $data = $request->validated();

        if ($response = $this->byMealInFixed($category->group->value, $data['split_type'] ?? $category->split_type->value)) {
            return $response;
        }

        if (isset($data['name'])) {
            $data['name'] = trim($data['name']);
        }
        $category->update($data);

        return new CategoryResource($category->fresh());
    }

    /** Delete = archive: bills, expenses and closed months keep pointing at it. */
    public function destroy(Mess $mess, Category $category): CategoryResource
    {
        if ($category->archived_at === null) {
            $category->update(['archived_at' => now()]);
        }

        return new CategoryResource($category->fresh());
    }

    private function byMealInFixed(string $group, string $splitType): ?JsonResponse
    {
        if ($group === Group::Fixed->value && $splitType === SplitType::ByMeal->value) {
            return response()->json([
                'message' => __('Fixed bills cannot be split by meals.'),
                'code' => 'by_meal_not_allowed_in_fixed',
            ], 409);
        }

        return null;
    }
}
