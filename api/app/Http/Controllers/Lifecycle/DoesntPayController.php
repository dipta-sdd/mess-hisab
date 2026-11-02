<?php

namespace App\Http\Controllers\Lifecycle;

use App\Enums\DoesntPayMode;
use App\Http\Controllers\Controller;
use App\Http\Requests\Lifecycle\DoesntPayRequest;
use App\Http\Resources\Lifecycle\RecoverableResource;
use App\Models\Mess;
use App\Models\Month;
use App\Models\Recoverable;
use App\Services\Month\Lifecycle\DoesntPayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class DoesntPayController extends Controller
{
    public function store(DoesntPayRequest $request, Mess $mess, Month $month, DoesntPayService $service): JsonResponse
    {
        $d = $request->validated();
        $recoverable = $service->create(
            $mess, $month, (int) $d['member_id'], DoesntPayMode::from($d['mode']), $d['manual'] ?? [], currentMember(),
        );

        return (new RecoverableResource($recoverable))->response()->setStatusCode(201);
    }

    public function destroy(Mess $mess, Month $month, Recoverable $recoverable, DoesntPayService $service): Response
    {
        $service->undo($mess, $month, $recoverable);

        return response()->noContent();
    }
}
