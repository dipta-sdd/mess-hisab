<?php

use App\Models\AuditLog;
use App\Models\MessMember;

it('lets the admin update settings and logs settings.updated', function () {
    [$mess, $me] = actingAsMember('admin');
    AuditLog::query()->delete(); // drop the setup noise

    $res = $this->patchJson(messPath($mess, 'settings'), [
        'name' => 'Renamed', 'rounding_mode' => 'round_up', 'meal_tracking' => 'bld_ticks', 'meal_entry_by' => 'self',
        'approval_required' => true, 'deposit_paisa' => 250000, 'min_meals_enabled' => true, 'min_meals_centi' => 2000,
        'min_payable_enabled' => true, 'min_payable_paisa' => 50000, 'month_start_day' => 10,
        'breakfast_weight_centi' => 50, 'fixed_due_day_offset' => 7, 'deposit_due_day_offset' => 3,
    ])->assertOk();

    expectContractShape($res->json('data'), 'Mess');
    expect($res->json('data'))->toMatchArray([
        'name' => 'Renamed', 'rounding_mode' => 'round_up', 'meal_tracking' => 'bld_ticks', 'meal_entry_by' => 'self',
        'approval_required' => true, 'deposit_paisa' => 250000, 'min_meals_enabled' => true, 'min_meals_centi' => 2000,
        'min_payable_enabled' => true, 'min_payable_paisa' => 50000, 'month_start_day' => 10, 'fixed_due_day_offset' => 7,
        'deposit_due_day_offset' => 3,
    ]);

    $log = AuditLog::where('event', 'settings.updated')->sole();
    expect($log->mess_id)->toBe($mess->id)->and($log->member_id)->toBe($me->id)->and($log->user_id)->toBe($me->user_id)
        ->and($log->before['name'])->toBe($mess->name)
        ->and($log->after['name'])->toBe('Renamed');
    expect(AuditLog::where('event', 'mess.updated')->count())->toBe(0);
});

it('can clear optional values', function () {
    [$mess] = actingAsMember('admin');
    $mess->update(['min_meals_enabled' => true, 'min_meals_centi' => 1000]);

    $this->patchJson(messPath($mess, 'settings'), ['min_meals_enabled' => false, 'min_meals_centi' => null])
        ->assertOk()->assertJsonPath('data.min_meals_centi', null)->assertJsonPath('data.min_meals_enabled', false);
});

it('only changes what was sent and ignores role fields', function () {
    [$mess, $me] = actingAsMember('admin');
    $other = MessMember::factory()->for($mess)->create();

    $this->patchJson(messPath($mess, 'settings'), ['name' => 'X', 'admin_member_id' => $other->id, 'manager_member_id' => $other->id, 'id' => 999])->assertOk();

    $fresh = $mess->fresh();
    expect($fresh->admin_member_id)->toBe($me->id)->and($fresh->id)->toBe($mess->id)->and($fresh->rounding_mode->value)->toBe('whole_taka');
});

it('writes no audit row when nothing changed', function () {
    [$mess] = actingAsMember('admin');
    AuditLog::query()->delete();

    $this->patchJson(messPath($mess, 'settings'), ['name' => $mess->name])->assertOk();
    $this->patchJson(messPath($mess, 'settings'), [])->assertOk();

    expect(AuditLog::where('event', 'settings.updated')->count())->toBe(0);
});

it('validates settings', function (array $body, string $field) {
    [$mess] = actingAsMember('admin');

    $this->patchJson(messPath($mess, 'settings'), $body)->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'bad rounding mode' => [['rounding_mode' => 'nope'], 'rounding_mode'],
    'bad meal tracking' => [['meal_tracking' => 'x'], 'meal_tracking'],
    'bad entry by' => [['meal_entry_by' => 'everyone'], 'meal_entry_by'],
    'start day 0' => [['month_start_day' => 0], 'month_start_day'],
    'start day 29' => [['month_start_day' => 29], 'month_start_day'],
    'negative deposit' => [['deposit_paisa' => -1], 'deposit_paisa'],
    'float deposit' => [['deposit_paisa' => 10.5], 'deposit_paisa'],
    'empty name' => [['name' => ''], 'name'],
    'non boolean' => [['approval_required' => 'maybe'], 'approval_required'],
    'bad currency' => [['currency' => 'TAKA'], 'currency'],
    'negative min meals' => [['min_meals_centi' => -5], 'min_meals_centi'],
]);

it('forbids non-admins, including the manager', function (string $role) {
    [$mess] = actingAsMember($role);

    $this->patchJson(messPath($mess, 'settings'), ['name' => 'Nope'])->assertForbidden();
    expect($mess->fresh()->name)->toBe($mess->name);
})->with(['manager', 'member']);

it('forbids archived members from writing', function () {
    [$mess] = actingAsMember('archived');

    $this->patchJson(messPath($mess, 'settings'), ['name' => 'Nope'])->assertForbidden();
});

it('returns 404 for another mess', function () {
    actingAsMember('admin');

    $this->patchJson(messPath(otherMess(), 'settings'), ['name' => 'X'])->assertNotFound();
});

it('requires auth', function () {
    $this->patchJson(messPath(otherMess(), 'settings'), ['name' => 'X'])->assertUnauthorized();
});
