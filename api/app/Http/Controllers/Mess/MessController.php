<?php

namespace App\Http\Controllers\Mess;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mess\StoreMessRequest;
use App\Http\Resources\MemberResource;
use App\Http\Resources\MessResource;
use App\Models\Mess;
use App\Services\Mess\MessCreator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MessController extends Controller
{
    public function store(StoreMessRequest $request, MessCreator $creator): JsonResponse
    {
        [$mess, $member] = $creator->create($request->user(), $request->validated());

        return response()->json(['data' => [
            'mess' => (new MessResource($mess))->resolve($request),
            'member' => (new MemberResource($member))->resolve($request),
        ]], 201);
    }

    public function show(Request $request, Mess $mess): JsonResponse
    {
        $me = currentMember();
        $me->setRelation('mess', $mess);

        return response()->json(['data' => [
            'mess' => (new MessResource($mess))->resolve($request),
            'me' => (new MemberResource($me))->resolve($request),
        ]]);
    }
}
