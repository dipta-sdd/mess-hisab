<?php

namespace App\Http\Controllers\Setup;

use App\Http\Controllers\Controller;
use App\Http\Requests\Setup\UpdateBillRequest;
use App\Http\Resources\BillResource;
use App\Models\Category;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Setup\BillSetup;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BillController extends Controller
{
    public function update(UpdateBillRequest $request, Mess $mess, Month $month, Category $category, BillSetup $bills): BillResource
    {
        return new BillResource($bills->save(
            $month, $category,
            $request->has('amount_paisa') ? (int) $request->validated('amount_paisa') : null,
            $request->overrideMap(),
        ));
    }

    public function spread(Request $request, Mess $mess, Month $month, Category $category, BillSetup $bills): BillResource
    {
        $this->assertSplittable($category);

        return new BillResource($bills->spread($month, $category));
    }

    public function accept(Request $request, Mess $mess, Month $month, Category $category, BillSetup $bills): BillResource
    {
        $this->assertSplittable($category);

        return new BillResource($bills->accept($month, $category));
    }

    /** by_meal categories are split by the meal engine; there is nothing to spread or accept here. */
    private function assertSplittable(Category $category): void
    {
        if ($category->split_type->value === 'by_meal') {
            throw ValidationException::withMessages(['category' => ['A by-meal category has no unallocated amount.']]);
        }
    }
}
