<?php

namespace App\Http\Controllers\Member;

use App\Enums\MonthStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Member\StoreMemberRequest;
use App\Http\Requests\Member\UpdateMemberRequest;
use App\Http\Resources\MemberResource;
use App\Models\Invite;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Audit\AuditLogger;
use App\Services\Mess\MessCreator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MemberController extends Controller
{
    public function index(Mess $mess): AnonymousResourceCollection
    {
        $members = MessMember::query()->orderBy('id')->get()->each->setRelation('mess', $mess);

        return MemberResource::collection($members)->additional(['meta' => ['total' => $members->count()]]);
    }

    public function store(StoreMemberRequest $request, Mess $mess, MessCreator $creator): JsonResponse
    {
        $data = $request->validated();

        $member = DB::transaction(function () use ($data, $mess, $creator) {
            $opening = $data['opening_balance_paisa'] ?? null;
            $month = null;
            if ($opening) {
                // Opening balance goes into the latest open month (task M owns months).
                $month = Month::query()->where('status', MonthStatus::Open)->orderByDesc('starts_on')->first();
                if ($month === null) {
                    throw ValidationException::withMessages(['opening_balance_paisa' => [__('There is no open month to record an opening balance in.')]]);
                }
            }

            $member = MessMember::create([
                'mess_id' => $mess->id,
                'user_id' => null,
                'display_name' => $data['display_name'],
                'joined_on' => $data['joined_on'],
            ]);

            if ($month) {
                $creator->opening($mess, $month, $member, $opening, currentMember());
            }

            return $member;
        });

        $member->setRelation('mess', $mess);

        return (new MemberResource($member))->response()->setStatusCode(201);
    }

    public function update(UpdateMemberRequest $request, Mess $mess, MessMember $member): MemberResource
    {
        $member->update($request->validated());
        $member->setRelation('mess', $mess);

        return new MemberResource($member->fresh()->setRelation('mess', $mess));
    }

    public function archive(Mess $mess, MessMember $member, AuditLogger $audit): JsonResponse|MemberResource
    {
        $member->setRelation('mess', $mess);

        if ($member->isAdmin() || $member->isManager()) {
            return response()->json([
                'message' => __('The admin and the manager cannot be archived. Hand over the role first.'),
                'code' => 'is_admin_or_manager',
            ], 409);
        }

        if (! $member->isArchived()) {
            $before = ['left_on' => $member->left_on?->toDateString(), 'archived_at' => null];

            DB::transaction(function () use ($member) {
                $member->left_on ??= Carbon::today();
                $member->archived_at = now();
                // The explicit member.archived event replaces the generic member update one.
                MessMember::withoutEvents(fn () => $member->save());

                // A placeholder that is archived can no longer be claimed.
                Invite::query()->where('member_id', $member->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
            });

            $member = $member->fresh()->setRelation('mess', $mess);
            $audit->log('member.archived', $member, $before, [
                'left_on' => $member->left_on?->toDateString(),
                'archived_at' => $member->archived_at?->toIso8601String(),
            ]);
        }

        return new MemberResource($member);
    }
}
