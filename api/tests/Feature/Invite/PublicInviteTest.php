<?php

use App\Models\AuditLog;
use App\Models\Invite;
use App\Models\MessMember;

function cInvite(array $over = []): Invite
{
    $m = otherMess();
    $creator = MessMember::forMess($m->id)->first();

    return Invite::factory()->create(array_merge(['mess_id' => $m->id, 'created_by_member_id' => $creator->id], $over));
}

it('shows a valid invite without authentication', function () {
    $invite = cInvite();

    $this->getJson("/api/invites/{$invite->token}")->assertOk()
        ->assertExactJson(['data' => ['mess_name' => \App\Models\Mess::find($invite->mess_id)->name, 'valid' => true]]);
});

it('includes the placeholder name when the invite names one', function () {
    $m = otherMess();
    $slot = MessMember::factory()->for($m)->placeholder()->create(['display_name' => 'Dipta']);
    $invite = Invite::factory()->create(['mess_id' => $m->id, 'member_id' => $slot->id, 'created_by_member_id' => $m->admin_member_id]);

    $this->getJson("/api/invites/{$invite->token}")->assertOk()
        ->assertJsonPath('data.member_display_name', 'Dipta')->assertJsonPath('data.valid', true);
});

it('explains why an invite is not valid', function (array $state, string $reason) {
    $invite = cInvite($state);

    $this->getJson("/api/invites/{$invite->token}")->assertOk()
        ->assertJsonPath('data.valid', false)->assertJsonPath('data.reason', $reason);
})->with([
    'revoked' => fn () => [['revoked_at' => now()], 'revoked'],
    'expired' => fn () => [['expires_at' => now()->subMinute()], 'expired'],
    'used up' => fn () => [['max_uses' => 2, 'uses' => 2], 'used_up'],
]);

it('reports member_unavailable when the slot was claimed or archived', function () {
    $m = otherMess();
    $claimed = MessMember::factory()->for($m)->create();
    $archived = MessMember::factory()->for($m)->placeholder()->archived()->create();

    foreach ([$claimed, $archived] as $slot) {
        $invite = Invite::factory()->create(['mess_id' => $m->id, 'member_id' => $slot->id, 'created_by_member_id' => $m->admin_member_id]);
        $this->getJson("/api/invites/{$invite->token}")->assertJsonPath('data.reason', 'member_unavailable');
    }
});

it('returns 404 for an unknown token', function () {
    $this->getJson('/api/invites/nope')->assertNotFound();
});

it('lets a signed-in user join as a new member', function () {
    $invite = cInvite(['max_uses' => 3]);
    $user = user(['name' => 'Joiner']);
    $this->actingAs($user);

    $res = $this->postJson("/api/invites/{$invite->token}/accept")->assertOk();

    $member = MessMember::forMess($invite->mess_id)->where('user_id', $user->id)->sole();
    expect($res->json('data'))->toBe(['mess_id' => $invite->mess_id, 'member_id' => $member->id])
        ->and($member->display_name)->toBe('Joiner')
        ->and($member->joined_on->toDateString())->toBe(now()->toDateString());
    expect($invite->fresh()->uses)->toBe(1);

    $log = AuditLog::where('event', 'invite.accepted')->sole();
    expect($log->mess_id)->toBe($invite->mess_id)->and($log->member_id)->toBe($member->id)->and($log->user_id)->toBe($user->id)
        ->and($log->subject_id)->toBe($invite->id);
});

it('uses the chosen display name', function () {
    $invite = cInvite();
    $this->actingAs(user());

    $res = $this->postJson("/api/invites/{$invite->token}/accept", ['display_name' => 'Nick'])->assertOk();

    expect(MessMember::find($res->json('data.member_id'))->display_name)->toBe('Nick');
});

it('claims a placeholder, keeping its ledger identity', function () {
    $m = otherMess();
    $slot = MessMember::factory()->for($m)->placeholder()->create(['display_name' => 'Dipta']);
    $invite = Invite::factory()->create(['mess_id' => $m->id, 'member_id' => $slot->id, 'created_by_member_id' => $m->admin_member_id]);
    $user = user();
    $this->actingAs($user);
    $before = MessMember::forMess($m->id)->count();

    $res = $this->postJson("/api/invites/{$invite->token}/accept")->assertOk();

    expect($res->json('data.member_id'))->toBe($slot->id);
    expect($slot->fresh()->user_id)->toBe($user->id)->and($slot->fresh()->display_name)->toBe('Dipta');
    expect(MessMember::forMess($m->id)->count())->toBe($before);
    expect(AuditLog::where('event', 'invite.accepted')->sole()->member_id)->toBe($slot->id);

    // The slot is now taken: a second person cannot reuse the link.
    $this->actingAs(user());
    $this->postJson("/api/invites/{$invite->token}/accept")->assertStatus(409)->assertJsonPath('code', 'invite_invalid');
});

it('rejects unusable invites with 409 invite_invalid', function (array $state) {
    $invite = cInvite($state);
    $this->actingAs(user());

    $this->postJson("/api/invites/{$invite->token}/accept")->assertStatus(409)->assertJsonPath('code', 'invite_invalid');
    expect(MessMember::forMess($invite->mess_id)->count())->toBe(1)->and($invite->fresh()->uses)->toBe($state['uses'] ?? 0);
})->with([
    'revoked' => [['revoked_at' => '2026-01-01 00:00:00']],
    'expired' => [['expires_at' => '2026-01-01 00:00:00']],
    'used up' => [['max_uses' => 1, 'uses' => 1]],
]);

it('rejects an unknown token with 409 invite_invalid', function () {
    $this->actingAs(user());

    $this->postJson('/api/invites/nope/accept')->assertStatus(409)->assertJsonPath('code', 'invite_invalid');
});

it('stops a single-use invite after one acceptance', function () {
    $invite = cInvite(['max_uses' => 1]);
    $this->actingAs(user());
    $this->postJson("/api/invites/{$invite->token}/accept")->assertOk();

    $this->actingAs(user());
    $this->postJson("/api/invites/{$invite->token}/accept")->assertStatus(409)->assertJsonPath('code', 'invite_invalid');
    expect($invite->fresh()->uses)->toBe(1);
});

it('returns already_member before invite_invalid', function () {
    $invite = cInvite(['revoked_at' => now()]);
    $existing = MessMember::forMess($invite->mess_id)->first();
    $this->actingAs($existing->user);

    $this->postJson("/api/invites/{$invite->token}/accept")->assertStatus(409)->assertJsonPath('code', 'already_member');

    $valid = cInvite();
    $this->actingAs(MessMember::forMess($valid->mess_id)->first()->user);
    $this->postJson("/api/invites/{$valid->token}/accept")->assertStatus(409)->assertJsonPath('code', 'already_member');
    expect($valid->fresh()->uses)->toBe(0);
});

it('validates the display name', function () {
    $invite = cInvite();
    $this->actingAs(user());

    $this->postJson("/api/invites/{$invite->token}/accept", ['display_name' => str_repeat('a', 101)])->assertUnprocessable()->assertJsonValidationErrors(['display_name']);
});

it('requires auth to accept', function () {
    $invite = cInvite();

    $this->postJson("/api/invites/{$invite->token}/accept")->assertUnauthorized();
});
