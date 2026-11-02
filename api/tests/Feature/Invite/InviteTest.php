<?php

use App\Models\AuditLog;
use App\Models\Invite;
use App\Models\MessMember;

it('creates a generic invite', function (string $role) {
    [$mess, $me] = actingAsMember($role);

    $res = $this->postJson(messPath($mess, 'invites'), [])->assertCreated();

    expectContractShape($res->json('data'), 'Invite');
    $invite = Invite::sole();
    expect($res->json('data'))->toMatchArray(['token' => $invite->token, 'member_id' => null, 'expires_at' => null, 'max_uses' => null, 'uses' => 0, 'revoked_at' => null])
        ->and($res->json('data.url'))->toEndWith('/invite/'.$invite->token)
        ->and(strlen($invite->token))->toBeGreaterThanOrEqual(32)
        ->and($invite->created_by_member_id)->toBe($me->id)->and($invite->mess_id)->toBe($mess->id);
})->with(['admin', 'manager']);

it('creates an invite for a placeholder with expiry and max uses', function () {
    [$mess] = actingAsMember('admin');
    $slot = MessMember::factory()->for($mess)->placeholder()->create();

    $res = $this->postJson(messPath($mess, 'invites'), ['member_id' => $slot->id, 'expires_in_days' => 7, 'max_uses' => 1])->assertCreated();

    expectContractShape($res->json('data'), 'Invite');
    expect($res->json('data.member_id'))->toBe($slot->id)->and($res->json('data.max_uses'))->toBe(1);
    expect(Invite::sole()->expires_at->isBetween(now()->addDays(7)->subMinute(), now()->addDays(7)->addMinute()))->toBeTrue();
});

it('validates invite creation', function (array $body) {
    [$mess] = actingAsMember('admin');

    $this->postJson(messPath($mess, 'invites'), $body)->assertUnprocessable();
    expect(Invite::count())->toBe(0);
})->with([
    'zero days' => [['expires_in_days' => 0]],
    'too many days' => [['expires_in_days' => 400]],
    'zero uses' => [['max_uses' => 0]],
    'float uses' => [['max_uses' => 1.5]],
    'unknown member' => [['member_id' => 999999]],
]);

it('rejects a member who already has an account, is archived or is in another mess', function () {
    [$mess, $me] = actingAsMember('admin');
    $archived = MessMember::factory()->for($mess)->placeholder()->archived()->create();
    $foreign = MessMember::factory()->for(otherMess())->placeholder()->create();

    foreach ([$me->id, $archived->id, $foreign->id] as $id) {
        $this->postJson(messPath($mess, 'invites'), ['member_id' => $id])->assertUnprocessable()->assertJsonValidationErrors(['member_id']);
    }
});

it('lists this mess invites newest first', function () {
    [$mess, $me] = actingAsMember('manager');
    $a = Invite::factory()->create(['mess_id' => $mess->id, 'created_by_member_id' => $me->id]);
    $b = Invite::factory()->create(['mess_id' => $mess->id, 'created_by_member_id' => $me->id]);
    Invite::factory()->create(['mess_id' => otherMess()->id]);

    $res = $this->getJson(messPath($mess, 'invites'))->assertOk();

    expect($res->json('data.*.id'))->toBe([$b->id, $a->id])->and($res->json('meta.total'))->toBe(2);
    foreach ($res->json('data') as $row) {
        expectContractShape($row, 'Invite');
    }
});

it('revokes an invite with 204 and keeps the row', function () {
    [$mess, $me] = actingAsMember('admin');
    $invite = Invite::factory()->create(['mess_id' => $mess->id, 'created_by_member_id' => $me->id]);

    $this->deleteJson(messPath($mess, "invites/{$invite->id}"))->assertNoContent();

    expect($invite->fresh()->revoked_at)->not->toBeNull();
    $this->deleteJson(messPath($mess, "invites/{$invite->id}"))->assertNoContent();
});

it('forbids plain and archived members from managing invites', function (string $role) {
    [$mess, $me] = actingAsMember($role);
    $invite = Invite::factory()->create(['mess_id' => $mess->id, 'created_by_member_id' => $me->id]);

    $this->getJson(messPath($mess, 'invites'))->assertForbidden();
    $this->postJson(messPath($mess, 'invites'), [])->assertForbidden();
    $this->deleteJson(messPath($mess, "invites/{$invite->id}"))->assertForbidden();
    expect($invite->fresh()->revoked_at)->toBeNull();
})->with(['member', 'archived']);

it('does not let a mess revoke another mess invite', function () {
    [$mess] = actingAsMember('admin');
    $theirs = Invite::factory()->create(['mess_id' => otherMess()->id]);
    $other = otherMess();

    $this->getJson(messPath($other, 'invites'))->assertNotFound();
    $this->postJson(messPath($other, 'invites'), [])->assertNotFound();
    $this->deleteJson(messPath($mess, "invites/{$theirs->id}"))->assertNotFound();
    $this->deleteJson(messPath($other, "invites/{$theirs->id}"))->assertNotFound();
    expect($theirs->fresh()->revoked_at)->toBeNull();
});

it('requires auth for mess-scoped invite routes', function () {
    $other = otherMess();

    $this->getJson(messPath($other, 'invites'))->assertUnauthorized();
    $this->postJson(messPath($other, 'invites'), [])->assertUnauthorized();
});
