<?php

use App\Enums\LedgerType;
use App\Models\AuditLog;
use App\Models\Invite;
use App\Models\LedgerEntry;
use App\Models\MessMember;
use App\Models\Month;

it('lists members with flags', function () {
    [$mess, $me] = actingAsMember('member');
    $gone = MessMember::factory()->for($mess)->archived()->create(['display_name' => 'Gone']);
    $pending = MessMember::factory()->for($mess)->placeholder()->create(['display_name' => 'Pending']);
    $other = otherMess();

    $res = $this->getJson(messPath($mess, 'members'))->assertOk();

    foreach ($res->json('data') as $row) {
        expectContractShape($row, 'Member');
    }
    $byId = collect($res->json('data'))->keyBy('id');
    expect($byId)->toHaveCount(5) // admin + manager (from the helper), me, Gone, Pending
        ->and($byId[$gone->id]['archived_at'])->not->toBeNull()
        ->and($byId[$pending->id]['has_account'])->toBeFalse()
        ->and($byId[$mess->admin_member_id]['is_admin'])->toBeTrue()
        ->and($byId[$mess->manager_member_id]['is_manager'])->toBeTrue()
        ->and($byId[$me->id]['is_admin'])->toBeFalse()
        ->and($byId->keys()->all())->not->toContain(MessMember::forMess($other->id)->first()->id);
});

it('lets the admin and the manager add a member', function (string $role) {
    [$mess, $me] = actingAsMember($role);

    $res = $this->postJson(messPath($mess, 'members'), ['display_name' => 'Newbie', 'joined_on' => '2026-11-03'])->assertCreated();

    expectContractShape($res->json('data'), 'Member');
    expect($res->json('data'))->toMatchArray(['display_name' => 'Newbie', 'user_id' => null, 'has_account' => false, 'joined_on' => '2026-11-03', 'left_on' => null, 'archived_at' => null]);
    expect(MessMember::forMess($mess->id)->where('display_name', 'Newbie')->exists())->toBeTrue();
    expect(LedgerEntry::forMess($mess->id)->count())->toBe(0);
})->with(['admin', 'manager', 'admin_manager']);

it('records an opening balance in the latest open month', function () {
    [$mess] = actingAsMember('admin');
    Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    $open = Month::factory()->create(['mess_id' => $mess->id]);

    $id = $this->postJson(messPath($mess, 'members'), ['display_name' => 'Debtor', 'joined_on' => '2026-11-03', 'opening_balance_paisa' => -250000])
        ->assertCreated()->json('data.id');

    $row = LedgerEntry::forMess($mess->id)->sole();
    expect($row->member_id)->toBe($id)->and($row->month_id)->toBe($open->id)->and($row->type)->toBe(LedgerType::Opening)
        ->and($row->group->value)->toBe('fixed')->and($row->amount_paisa)->toBe(-250000);
});

it('rejects an opening balance when no month is open, creating nothing', function () {
    [$mess] = actingAsMember('admin');
    $before = MessMember::forMess($mess->id)->count();

    $this->postJson(messPath($mess, 'members'), ['display_name' => 'X', 'joined_on' => '2026-11-03', 'opening_balance_paisa' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors(['opening_balance_paisa']);

    expect(MessMember::forMess($mess->id)->count())->toBe($before);
});

it('validates adding a member', function (array $body, array $errors) {
    [$mess] = actingAsMember('admin');

    $this->postJson(messPath($mess, 'members'), $body)->assertUnprocessable()->assertJsonValidationErrors($errors);
})->with([
    'empty' => [[], ['display_name', 'joined_on']],
    'bad date' => [['display_name' => 'A', 'joined_on' => '03/11/2026'], ['joined_on']],
    'float opening' => [['display_name' => 'A', 'joined_on' => '2026-11-03', 'opening_balance_paisa' => 1.5], ['opening_balance_paisa']],
]);

it('forbids plain members and archived members from adding', function (string $role) {
    [$mess] = actingAsMember($role);

    $this->postJson(messPath($mess, 'members'), ['display_name' => 'A', 'joined_on' => '2026-11-03'])->assertForbidden();
})->with(['member', 'archived']);

it('returns 404 for member routes of another mess', function () {
    actingAsMember('admin');
    $other = otherMess();
    $theirs = MessMember::forMess($other->id)->first();

    $this->getJson(messPath($other, 'members'))->assertNotFound();
    $this->postJson(messPath($other, 'members'), ['display_name' => 'A', 'joined_on' => '2026-11-03'])->assertNotFound();
    $this->patchJson(messPath($other, "members/{$theirs->id}"), ['display_name' => 'A'])->assertNotFound();
    $this->postJson(messPath($other, "members/{$theirs->id}/archive"))->assertNotFound();
});

it('updates a member and 404s on a member of another mess', function () {
    [$mess] = actingAsMember('manager');
    $target = MessMember::factory()->for($mess)->create(['display_name' => 'Old']);

    $res = $this->patchJson(messPath($mess, "members/{$target->id}"), ['display_name' => 'New', 'joined_on' => '2026-10-20', 'left_on' => '2026-11-20'])->assertOk();

    expectContractShape($res->json('data'), 'Member');
    expect($res->json('data'))->toMatchArray(['display_name' => 'New', 'joined_on' => '2026-10-20', 'left_on' => '2026-11-20']);
    expect($target->fresh()->archived_at)->toBeNull();

    $foreign = MessMember::forMess(otherMess()->id)->first();
    $this->patchJson(messPath($mess, "members/{$foreign->id}"), ['display_name' => 'Hack'])->assertNotFound();
    expect($foreign->fresh()->display_name)->not->toBe('Hack');
});

it('clears left_on and validates dates on update', function () {
    [$mess] = actingAsMember('admin');
    $target = MessMember::factory()->for($mess)->create(['joined_on' => '2026-11-10', 'left_on' => '2026-11-20']);
    $url = messPath($mess, "members/{$target->id}");

    $this->patchJson($url, ['left_on' => null])->assertOk()->assertJsonPath('data.left_on', null);
    $this->patchJson($url, ['left_on' => '2026-11-01'])->assertUnprocessable()->assertJsonValidationErrors(['left_on']);
    $this->patchJson($url, ['joined_on' => '2026-12-01', 'left_on' => '2026-11-30'])->assertUnprocessable()->assertJsonValidationErrors(['left_on']);
    $this->patchJson($url, ['display_name' => ''])->assertUnprocessable()->assertJsonValidationErrors(['display_name']);
    $this->patchJson($url, ['joined_on' => 'x'])->assertUnprocessable()->assertJsonValidationErrors(['joined_on']);
});

it('forbids plain members from updating', function () {
    [$mess, $me] = actingAsMember('member');

    $this->patchJson(messPath($mess, "members/{$me->id}"), ['display_name' => 'Self'])->assertForbidden();
});

it('archives a member, sets left_on, revokes their invites and logs member.archived', function () {
    [$mess, $me] = actingAsMember('admin');
    $target = MessMember::factory()->for($mess)->placeholder()->create(['left_on' => null]);
    $invite = Invite::factory()->create(['mess_id' => $mess->id, 'member_id' => $target->id, 'created_by_member_id' => $me->id]);
    AuditLog::query()->delete();

    $res = $this->postJson(messPath($mess, "members/{$target->id}/archive"))->assertOk();

    expectContractShape($res->json('data'), 'Member');
    expect($res->json('data.archived_at'))->not->toBeNull()->and($res->json('data.left_on'))->toBe(now()->toDateString());
    expect($invite->fresh()->revoked_at)->not->toBeNull();

    $log = AuditLog::where('event', 'member.archived')->sole();
    expect($log->subject_id)->toBe($target->id)->and($log->member_id)->toBe($me->id)->and($log->mess_id)->toBe($mess->id);
    expect(AuditLog::where('event', 'mess_member.updated')->count())->toBe(0);
});

it('keeps an existing left_on when archiving and is idempotent', function () {
    [$mess] = actingAsMember('manager');
    $target = MessMember::factory()->for($mess)->create(['left_on' => '2026-11-12']);
    $url = messPath($mess, "members/{$target->id}/archive");

    $this->postJson($url)->assertOk()->assertJsonPath('data.left_on', '2026-11-12');
    $this->postJson($url)->assertOk();

    expect(AuditLog::where('event', 'member.archived')->count())->toBe(1);
});

it('refuses to archive the admin or the manager with 409 is_admin_or_manager', function () {
    [$mess, $me] = actingAsMember('admin');

    $this->postJson(messPath($mess, "members/{$me->id}/archive"))->assertStatus(409)->assertJsonPath('code', 'is_admin_or_manager');
    $this->postJson(messPath($mess, "members/{$mess->manager_member_id}/archive"))->assertStatus(409)->assertJsonPath('code', 'is_admin_or_manager');
    expect($me->fresh()->archived_at)->toBeNull();
});

it('forbids plain members and archived members from archiving', function (string $role) {
    [$mess] = actingAsMember($role);
    $target = MessMember::factory()->for($mess)->create();

    $this->postJson(messPath($mess, "members/{$target->id}/archive"))->assertForbidden();
    expect($target->fresh()->archived_at)->toBeNull();
})->with(['member', 'archived']);

it('requires auth', function () {
    $mess = otherMess();

    $this->getJson(messPath($mess, 'members'))->assertUnauthorized();
    $this->postJson(messPath($mess, 'members'), [])->assertUnauthorized();
});
