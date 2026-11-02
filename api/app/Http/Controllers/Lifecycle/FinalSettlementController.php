<?php

namespace App\Http\Controllers\Lifecycle;

use App\Http\Controllers\Controller;
use App\Http\Requests\Lifecycle\PaidOnRequest;
use App\Http\Resources\Lifecycle\ArrayResource;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Month\Lifecycle\FinalSettlement;
use Illuminate\Http\JsonResponse;

class FinalSettlementController extends Controller
{
    public function store(PaidOnRequest $request, Mess $mess, MessMember $member, FinalSettlement $settlement): JsonResponse
    {
        $d = $request->validated();

        return (new ArrayResource($settlement->pay($mess, $member, (int) $d['amount_paisa'], $d['paid_on'], currentMember())))
            ->response()->setStatusCode(201);
    }
}
