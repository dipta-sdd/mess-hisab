<?php

namespace App\Http\Controllers\Invite;

use App\Http\Controllers\Controller;
use App\Http\Requests\Invite\StoreInviteRequest;
use App\Http\Resources\InviteResource;
use App\Models\Invite;
use App\Models\Mess;
use App\Services\Invite\InviteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class InviteController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $invites = Invite::query()->orderByDesc('id')->get();

        return InviteResource::collection($invites)->additional(['meta' => ['total' => $invites->count()]]);
    }

    public function store(StoreInviteRequest $request, Mess $mess, InviteService $invites): JsonResponse
    {
        $invite = $invites->create($mess, currentMember(), $request->validated());

        return (new InviteResource($invite))->response()->setStatusCode(201);
    }

    public function destroy(Mess $mess, Invite $invite): Response
    {
        if ($invite->revoked_at === null) {
            $invite->update(['revoked_at' => now()]);
        }

        return response()->noContent();
    }
}
