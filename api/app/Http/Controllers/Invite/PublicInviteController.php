<?php

namespace App\Http\Controllers\Invite;

use App\Http\Controllers\Controller;
use App\Http\Requests\Invite\AcceptInviteRequest;
use App\Models\Invite;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Invite\InviteService;
use Illuminate\Http\JsonResponse;

/** Invite endpoints outside a mess: nobody is a member yet, so no `mess` middleware. */
class PublicInviteController extends Controller
{
    /** Unknown token → 404. Otherwise says whether the link works and, if not, why. */
    public function show(string $token, InviteService $invites): JsonResponse
    {
        $invite = Invite::query()->where('token', $token)->firstOrFail();
        $reason = $invites->problem($invite);

        $data = [
            'mess_name' => Mess::findOrFail($invite->mess_id)->name,
            'valid' => $reason === null,
        ];
        if ($invite->member_id !== null) {
            $data['member_display_name'] = MessMember::forMess($invite->mess_id)->find($invite->member_id)?->display_name;
        }
        if ($reason !== null) {
            $data['reason'] = $reason;
        }

        return response()->json(['data' => $data]);
    }

    public function accept(AcceptInviteRequest $request, string $token, InviteService $invites): JsonResponse
    {
        [$mess, $member] = $invites->accept($request->user(), $token, $request->validated('display_name'));

        return response()->json(['data' => ['mess_id' => $mess->id, 'member_id' => $member->id]]);
    }
}
