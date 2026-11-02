<?php

use App\Models\AuditLog;
use App\Models\Invite;
use App\Models\MessMember;

/** Drop the audit rows that factories/setup created, so each test controls its own rows. */
function auClear(): void
{
    AuditLog::withoutGlobalScopes()->delete();
}

function auLog($mess, string $event, array $over = []): AuditLog
{
    return AuditLog::forceCreate($over + [
        'mess_id' => $mess->id, 'event' => $event, 'subject_type' => 'expense', 'subject_id' => 1,
        'before' => null, 'after' => ['amount_paisa' => 100], 'created_at' => '2026-11-10 12:00:00',
    ]);
}

it('lets any member read this mess audit log newest first with the contract shape', function () {
    [$mess, $me] = actingAsMember('member');
    auClear();
    auLog($mess, 'expense.created', ['member_id' => $me->id, 'created_at' => '2026-11-01 10:00:00']);
    auLog($mess, 'payment.created', ['created_at' => '2026-11-03 10:00:00']);

    $res = $this->getJson(messPath($mess, 'audit'))->assertOk();

    expect(array_column($res->json('data'), 'event'))->toBe(['payment.created', 'expense.created']);
    foreach ($res->json('data') as $row) {
        expectContractShape($row, 'AuditLog');
    }
    expect($res->json('data.0.before'))->toBe([])->and($res->content())->toContain('"before":{}');
    expect($res->json('data.1.created_at'))->toBe('2026-11-01T10:00:00+06:00');
});

it('never shows rows from another mess or with no mess', function () {
    [$mess] = actingAsMember('member');
    $foreign = otherMess();
    auClear();
    auLog($mess, 'expense.created');
    auLog($foreign, 'expense.created');
    AuditLog::forceCreate(['mess_id' => null, 'event' => 'auth.login', 'created_at' => now()]);

    $res = $this->getJson(messPath($mess, 'audit'))->assertOk();
    expect($res->json('data'))->toHaveCount(1);
    expect(AuditLog::forMess($foreign->id)->count())->toBe(1);
});

it('uses the paginator envelope', function () {
    [$mess] = actingAsMember('member');
    auClear();
    foreach (range(1, 5) as $i) {
        auLog($mess, 'expense.created');
    }

    $res = $this->getJson(messPath($mess, 'audit?per_page=2&page=2'))->assertOk();
    expect($res->json())->toHaveKeys(['data', 'links', 'meta']);
    expect($res->json('data'))->toHaveCount(2);
    expect($res->json('meta'))->toMatchArray(['current_page' => 2, 'per_page' => 2, 'total' => 5, 'last_page' => 3]);

    expect($this->getJson(messPath($mess, 'audit'))->json('meta.per_page'))->toBe(25);
    $this->getJson(messPath($mess, 'audit?per_page=500'))->assertUnprocessable()->assertJsonValidationErrors('per_page');
});

it('filters by exact event and by prefix', function () {
    [$mess] = actingAsMember('member');
    auClear();
    auLog($mess, 'expense.created');
    auLog($mess, 'expense.approved');
    auLog($mess, 'meal_entry.updated');
    auLog($mess, 'mealXentry.updated');

    $ev = fn (string $q) => array_column($this->getJson(messPath($mess, "audit?event={$q}"))->assertOk()->json('data'), 'event');

    expect($ev('expense.created'))->toBe(['expense.created']);
    expect($ev('expense.'))->toHaveCount(2);
    expect($ev('meal_entry.'))->toBe(['meal_entry.updated']); // "_" is not a wildcard
    expect($ev('expense'))->toBe([]); // no dot = exact match only
    $this->getJson(messPath($mess, 'audit?event=bad%25'))->assertUnprocessable();
});

it('filters by member and rejects members of another mess', function () {
    [$mess, $me] = actingAsMember('member');
    $gone = MessMember::factory()->for($mess)->archived()->create();
    auClear();
    auLog($mess, 'expense.created', ['member_id' => $me->id]);
    auLog($mess, 'expense.created', ['member_id' => $gone->id]);

    $mine = $this->getJson(messPath($mess, "audit?member_id={$me->id}"))->assertOk();
    expect($mine->json('data'))->toHaveCount(1)->and($mine->json('data.0.member_id'))->toBe($me->id);
    $this->getJson(messPath($mess, "audit?member_id={$gone->id}"))->assertOk()->assertJsonCount(1, 'data');

    $foreignMember = MessMember::factory()->for(otherMess())->create();
    $this->getJson(messPath($mess, "audit?member_id={$foreignMember->id}"))
        ->assertUnprocessable()->assertJsonValidationErrors('member_id');
});

it('filters from/to inclusively in Asia/Dhaka', function () {
    [$mess] = actingAsMember('member');
    auClear();
    auLog($mess, 'a.before', ['created_at' => '2026-11-09 23:59:59']);
    auLog($mess, 'a.start', ['created_at' => '2026-11-10 00:00:00']);
    auLog($mess, 'a.end', ['created_at' => '2026-11-11 23:59:59']);
    auLog($mess, 'a.after', ['created_at' => '2026-11-12 00:00:00']);

    $ev = fn (string $q) => array_column($this->getJson(messPath($mess, "audit?{$q}"))->assertOk()->json('data'), 'event');

    expect($ev('from=2026-11-10&to=2026-11-11'))->toBe(['a.end', 'a.start']);
    expect($ev('from=2026-11-11'))->toBe(['a.after', 'a.end']);
    expect($ev('to=2026-11-10'))->toBe(['a.start', 'a.before']);
    $this->getJson(messPath($mess, 'audit?from=2026-11-12&to=2026-11-10'))->assertUnprocessable();
    $this->getJson(messPath($mess, 'audit?from=nope'))->assertUnprocessable();
});

it('lets archived members read it', function () {
    [$mess] = actingAsMember('archived');
    auClear();
    auLog($mess, 'expense.created');
    $this->getJson(messPath($mess, 'audit'))->assertOk()->assertJsonCount(1, 'data');
});

it('requires login', function () {
    $mess = otherMess();
    $this->getJson(messPath($mess, 'audit'))->assertUnauthorized();
});

it('returns 404 for a mess the user does not belong to', function () {
    actingAsMember('manager');
    $this->getJson(messPath(otherMess(), 'audit'))->assertNotFound();
});

it('redacts secrets, including real invite audit rows', function () {
    [$mess, $me] = actingAsMember('manager');
    auClear();
    $invite = Invite::factory()->create(['mess_id' => $mess->id, 'created_by_member_id' => $me->id, 'token' => 'SUPERSECRETTOKEN']);
    expect(AuditLog::where('event', 'invite.created')->first()->after)->toHaveKey('token'); // observer does log it
    auLog($mess, 'user.updated', [
        'before' => ['password' => 'hash1', 'name' => 'Old'],
        'after' => ['password' => 'hash2', 'remember_token' => 'rt', 'name' => 'New', 'nested' => ['api_key' => 'k']],
    ]);

    $res = $this->getJson(messPath($mess, 'audit'))->assertOk();
    foreach (['SUPERSECRETTOKEN', 'hash1', 'hash2', '"rt"', '"k"'] as $secret) {
        expect($res->content())->not->toContain($secret);
    }
    $user = collect($res->json('data'))->firstWhere('event', 'user.updated');
    expect($user['after'])->toMatchArray(['password' => '[redacted]', 'name' => 'New', 'nested' => ['api_key' => '[redacted]']]);
    expect($invite->token)->toBe('SUPERSECRETTOKEN');
});
