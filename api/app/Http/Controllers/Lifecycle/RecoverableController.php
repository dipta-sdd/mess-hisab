<?php

namespace App\Http\Controllers\Lifecycle;

use App\Enums\RecoverableStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Lifecycle\PaidOnRequest;
use App\Http\Resources\Lifecycle\RecoverableResource;
use App\Models\Mess;
use App\Models\Recoverable;
use App\Services\Month\Lifecycle\RecoverableRepayer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class RecoverableController extends Controller
{
    /** Every request / unpaid share of the mess, newest first; undone requests are left out unless asked for. */
    public function index(Request $request, Mess $mess): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(RecoverableStatus::values())],
            'month_id' => ['sometimes', 'integer'],
            'member_id' => ['sometimes', 'integer'],
        ]);

        $rows = Recoverable::query()->with('shares')
            ->when(isset($data['status']), fn ($q) => $q->where('status', $data['status']),
                fn ($q) => $q->where('status', '!=', RecoverableStatus::Undone->value))
            ->when(isset($data['month_id']), fn ($q) => $q->where('month_id', $data['month_id']))
            ->when(isset($data['member_id']), fn ($q) => $q->where('debtor_member_id', $data['member_id']))
            ->orderByDesc('id')->get();

        return RecoverableResource::collection($rows)->additional(['meta' => ['total' => $rows->count()]]);
    }

    public function repay(PaidOnRequest $request, Mess $mess, Recoverable $recoverable, RecoverableRepayer $repayer): JsonResponse
    {
        $d = $request->validated();
        $repayer->repay($mess, $recoverable, (int) $d['amount_paisa'], $d['paid_on'], currentMember());

        return (new RecoverableResource($recoverable->fresh('shares')))->response()->setStatusCode(201);
    }
}
