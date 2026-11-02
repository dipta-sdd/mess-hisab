<?php

namespace App\Http\Controllers\Setup;

use App\Http\Controllers\Controller;
use App\Http\Requests\Setup\UpdateSetupRequest;
use App\Http\Resources\BillResource;
use App\Http\Resources\MemberMonthSettingResource;
use App\Http\Resources\MonthResource;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Setup\BillSetup;
use App\Services\Setup\MonthSetup;
use Illuminate\Http\JsonResponse;

class SetupController extends Controller
{
    /**
     * Every non-archived category with its split. For by_meal categories `shares` is empty and
     * `unallocated_paisa` is 0 on purpose: the meal engine (task J) computes those.
     * `member_settings` lists only the stored per-member overrides, not one row per member.
     */
    public function show(Mess $mess, Month $month, BillSetup $bills): JsonResponse
    {
        return response()->json(['data' => [
            'month' => (new MonthResource($month))->resolve(),
            'bills' => array_map(fn (array $b) => (new BillResource($b))->resolve(), $bills->billsFor($month)),
            'member_settings' => $month->memberSettings()->orderBy('member_id')->get()
                ->map(fn ($s) => (new MemberMonthSettingResource($s))->resolve())->all(),
        ]]);
    }

    public function update(UpdateSetupRequest $request, Mess $mess, Month $month, MonthSetup $setup): MonthResource
    {
        return new MonthResource($setup->updateMonth($month, $request->validated()));
    }
}
