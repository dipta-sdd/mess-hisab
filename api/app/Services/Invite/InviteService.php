<?php

namespace App\Services\Invite;

use App\Models\Invite;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Support\MessContext;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InviteService
{
    public function __construct(private AuditLogger $audit, private MessContext $context) {}

    /** @param array{member_id?: int|null, expires_in_days?: int|null, max_uses?: int|null} $data */
    public function create(Mess $mess, MessMember $by, array $data): Invite
    {
        return Invite::create([
            'mess_id' => $mess->id,
            'token' => Str::random(40),
            'member_id' => $data['member_id'] ?? null,
            'created_by_member_id' => $by->id,
            'expires_at' => ! empty($data['expires_in_days']) ? now()->addDays((int) $data['expires_in_days']) : null,
            'max_uses' => $data['max_uses'] ?? null,
        ]);
    }

    /**
     * Why a token cannot be used right now, or null when it can.
     * One of: revoked, expired, used_up, member_unavailable.
     */
    public function problem(Invite $invite): ?string
    {
        if ($invite->revoked_at !== null) {
            return 'revoked';
        }
        if ($invite->expires_at !== null && ! $invite->expires_at->isFuture()) {
            return 'expired';
        }
        if ($invite->max_uses !== null && $invite->uses >= $invite->max_uses) {
            return 'used_up';
        }
        if ($invite->member_id !== null) {
            $slot = MessMember::forMess($invite->mess_id)->find($invite->member_id);
            if ($slot === null || $slot->user_id !== null || $slot->isArchived()) {
                return 'member_unavailable';
            }
        }

        return null;
    }

    /**
     * Join the mess behind a token. Claims the placeholder slot when the invite
     * names one, otherwise adds a new member. Precedence: an unknown token or
     * unusable invite is `invite_invalid`; a user who is already in the mess
     * gets `already_member` first, even if the invite is spent.
     *
     * @return array{0: Mess, 1: MessMember}
     */
    public function accept(User $user, string $token, ?string $displayName): array
    {
        [$mess, $member, $invite] = DB::transaction(function () use ($user, $token, $displayName) {
            $invite = Invite::query()->where('token', $token)->lockForUpdate()->first();
            if ($invite === null) {
                $this->conflict('invite_invalid', 'This invite link is not valid.');
            }

            $already = MessMember::forMess($invite->mess_id)->where('user_id', $user->id)->exists();
            if ($already) {
                $this->conflict('already_member', 'You are already a member of this mess.');
            }

            if ($invite->member_id !== null) {
                // Lock the slot so two people cannot claim it together.
                MessMember::forMess($invite->mess_id)->whereKey($invite->member_id)->lockForUpdate()->first();
            }
            if ($this->problem($invite) !== null) {
                $this->conflict('invite_invalid', 'This invite link is no longer valid.');
            }

            $mess = Mess::findOrFail($invite->mess_id);

            if ($invite->member_id !== null) {
                $member = MessMember::forMess($mess->id)->findOrFail($invite->member_id);
                $member->forceFill(['user_id' => $user->id]);
                if ($displayName) {
                    $member->display_name = $displayName;
                }
                $member->save();
            } else {
                $member = MessMember::create([
                    'mess_id' => $mess->id,
                    'user_id' => $user->id,
                    'display_name' => $displayName ?: $user->name,
                    'joined_on' => Carbon::today()->toDateString(),
                ]);
            }

            $invite->increment('uses');

            return [$mess, $member, $invite];
        });

        $member->setRelation('mess', $mess);
        $this->logAccepted($mess, $member, $invite);

        return [$mess, $member];
    }

    private function logAccepted(Mess $mess, MessMember $member, Invite $invite): void
    {
        $previous = [$this->context->mess(), $this->context->member()];
        $this->context->set($mess, $member);
        try {
            $this->audit->log('invite.accepted', $invite, [], [], [
                'member_id' => $member->id,
                'claimed_placeholder' => $invite->member_id !== null,
            ]);
        } finally {
            $this->context->clear();
            if ($previous[0] !== null) {
                $this->context->set($previous[0], $previous[1]);
            }
        }
    }

    private function conflict(string $code, string $message): never
    {
        throw new HttpResponseException(response()->json(['message' => $message, 'code' => $code], 409));
    }
}
