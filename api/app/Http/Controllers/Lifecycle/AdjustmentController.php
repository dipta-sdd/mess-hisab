<?php

namespace App\Http\Controllers\Lifecycle;

use App\Enums\Group;
use App\Enums\LedgerType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Lifecycle\AdjustmentIndexRequest;
use App\Http\Requests\Lifecycle\AdjustmentRequest;
use App\Http\Resources\Lifecycle\AdjustmentResource;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Services\Month\Lifecycle\AdjustmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AdjustmentController extends Controller
{
    public function index(AdjustmentIndexRequest $request, Mess $mess): AnonymousResourceCollection
    {
        $data = $request->validated();
        $rows = LedgerEntry::query()->where('type', LedgerType::Adjustment->value)
            ->when(isset($data['month_id']), fn ($q) => $q->where('month_id', $data['month_id']))
            ->when(isset($data['member_id']), fn ($q) => $q->where('member_id', $data['member_id']))
            ->orderByDesc('id')->get();

        return AdjustmentResource::collection($rows)->additional(['meta' => ['total' => $rows->count()]]);
    }

    public function store(AdjustmentRequest $request, Mess $mess, AdjustmentService $service): JsonResponse
    {
        $d = $request->validated();
        $entry = $service->create($mess, (int) $d['member_id'], Group::from($d['group']), (int) $d['amount_paisa'], $d['note'], currentMember());

        return (new AdjustmentResource($entry))->response()->setStatusCode(201);
    }
}
