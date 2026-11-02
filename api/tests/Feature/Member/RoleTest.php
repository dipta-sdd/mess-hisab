<?php

use App\Models\AuditLog;
use App\Models\MessMember;

it('transfers admin and logs role.admin_transferred', function () {
    [$mess, $me] = actingAsMember('admin');
    $target = MessMember::factory()->for($mess)->create();
    AuditLog::query()->delete();

    $res = $this->postJson(messPath($mess, 'admin'), ['member_id' => $target->id])->assertOk();

    expectContractShape($res->json('data'), 'Mess');
    expect($res->json('data.admin_member_id'))->toBe($target->id)
        ->and($res->json('data.manager_member_id'))->toBe($mess->manager_member_id);
    $log = AuditLog::where('event', 'role.admin_transferred')->sole();
    expect($log->member_id)->toBe($me->id)->and($log->mess_id)->toBe($mess->id);
    expect(AuditLog::where('event', 'mess.updated')->count())->toBe(0);

    // The old admin lost the admin role.
    $this->postJson(messPath($mess, 'admin'), ['member_id' => $me->id])->assertForbidden();
});

it('assigns the manager and logs role.manager_assigned', function () {
    [$mess, $me] = actingAsMember('admin');
    $target = MessMember::factory()->for($mess)->create();
    AuditLog::query()->delete();

    $res = $this->postJson(messPath($mess, 'manager'), ['member_id' => $target->id])->assertOk();

    expectContractShape($res->json('data'), 'Mess');
    expect($res->json('data.manager_member_id'))->toBe($target->id)->and($res->json('data.admin_member_id'))->toBe($me->id);
    expect(AuditLog::where('event', 'role.manager_assigned')->count())->toBe(1);
});

it('does not log when the role does not change', function () {
    [$mess, $me] = actingAsMember('admin');
    AuditLog::query()->delete();

    $this->postJson(messPath($mess, 'manager'), ['member_id' => $mess->manager_member_id])->assertOk();

    expect(AuditLog::where('event', 'role.manager_assigned')->count())->toBe(0);
});

it('rejects targets without an account, archived or from another mess', function (string $path) {
    [$mess] = actingAsMember('admin');
    $placeholder = MessMember::factory()->for($mess)->placeholder()->create();
    $archived = MessMember::factory()->for($mess)->archived()->create();
    $foreign = MessMember::forMess(otherMess()->id)->first();

    foreach ([$placeholder->id, $archived->id, $foreign->id, 999999] as $id) {
        $this->postJson(messPath($mess, $path), ['member_id' => $id])->assertUnprocessable()->assertJsonValidationErrors(['member_id']);
    }
    $this->postJson(messPath($mess, $path), [])->assertUnprocessable()->assertJsonValidationErrors(['member_id']);
    $this->postJson(messPath($mess, $path), ['member_id' => 'abc'])->assertUnprocessable()->assertJsonValidationErrors(['member_id']);

    expect($mess->fresh()->only('admin_member_id', 'manager_member_id'))->toBe($mess->only('admin_member_id', 'manager_member_id'));
})->with(['admin', 'manager']);

it('forbids everyone but the admin, even the manager', function (string $role, string $path) {
    [$mess, $me] = actingAsMember($role);
    $target = MessMember::factory()->for($mess)->create();

    $this->postJson(messPath($mess, $path), ['member_id' => $target->id])->assertForbidden();
    expect($mess->fresh()->only('admin_member_id', 'manager_member_id'))->toBe($mess->only('admin_member_id', 'manager_member_id'));
})->with(['manager', 'member', 'archived'])->with(['admin', 'manager']);

it('returns 404 for another mess and 401 for guests', function () {
    actingAsMember('admin');
    $other = otherMess();

    $this->postJson(messPath($other, 'admin'), ['member_id' => 1])->assertNotFound();
    $this->postJson(messPath($other, 'manager'), ['member_id' => 1])->assertNotFound();

    auth()->guard('web')->logout();
    $this->app['auth']->forgetGuards();
    $this->postJson(messPath($other, 'admin'), ['member_id' => 1])->assertUnauthorized();
});
