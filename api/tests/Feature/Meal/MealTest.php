<?php

use App\Models\AuditLog;
use App\Models\MealEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Support\Carbon;

beforeEach(fn () => Carbon::setTestNow('2026-11-10 12:00:00'));
afterEach(fn () => Carbon::setTestNow());

function fmMonth(Mess $mess, array $attrs = []): Month
{
    return Month::factory()->create(['mess_id' => $mess->id] + $attrs);
}

function fmSetup(string $role, array $mess = []): array
{
    [$mess0, $me] = actingAsMember($role);
    $mess0->update($mess);
    $month = fmMonth($mess0);

    return [$mess0->fresh(), $me, $month];
}

function fmMember(Mess $mess, array $attrs = []): MessMember
{
    return MessMember::factory()->for($mess)->create($attrs);
}

// ---------------------------------------------------------------- GET

it('lists a month with style, entries and totals (default current month)', function () {
    [$mess, $me, $month] = fmSetup('member');
    $other = fmMember($mess);
    $quiet = fmMember($mess);
    MealEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $me->id, 'entry_date' => '2026-11-03', 'meals_centi' => 200, 'guest_meals_centi' => 50, 'entered_by_member_id' => $me->id]);
    MealEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $me->id, 'entry_date' => '2026-11-04', 'meals_centi' => 150, 'entered_by_member_id' => $me->id]);
    MealEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $other->id, 'entry_date' => '2026-11-03', 'meals_centi' => 100, 'entered_by_member_id' => $me->id]);
    $foreign = otherMess();
    MealEntry::factory()->create(['mess_id' => $foreign->id]);

    foreach ([messPath($mess, 'meals'), messPath($mess, "meals?month_id={$month->id}")] as $url) {
        $res = $this->getJson($url)->assertOk();
        $data = $res->json('data');
        expect($data['month_id'])->toBe($month->id)->and($data['style'])->toBe('daily_number')->and($data['entries'])->toHaveCount(3);
        foreach ($data['entries'] as $row) {
            expectContractShape($row, 'MealEntry');
        }
        expect($data['totals'][$me->id])->toBe(['meals_centi' => 350, 'guest_meals_centi' => 50]);
        expect($data['totals'][$other->id])->toBe(['meals_centi' => 100, 'guest_meals_centi' => 0]);
        expect($data['totals'][$quiet->id])->toBe(['meals_centi' => 0, 'guest_meals_centi' => 0]);
    }
});

it('rejects a month id from another mess and answers 404 outside the mess', function () {
    [$mess] = fmSetup('member');
    $foreign = otherMess();
    $foreignMonth = fmMonth($foreign);

    $this->getJson(messPath($mess, "meals?month_id={$foreignMonth->id}"))->assertUnprocessable()->assertJsonValidationErrors(['month_id']);
    $this->getJson(messPath($foreign, 'meals'))->assertNotFound();
});

it('still lists meals when tracking is off', function () {
    [$mess] = fmSetup('member', ['meal_tracking' => 'off']);

    $this->getJson(messPath($mess, 'meals'))->assertOk()->assertJsonPath('data.style', 'off')->assertJsonPath('data.entries', []);
});

// ---------------------------------------------------------------- daily_number

it('creates then updates a daily number entry and audits it', function () {
    [$mess, $me, $month] = fmSetup('manager');
    $m = fmMember($mess);

    $res = $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'meals_centi' => 250, 'guest_meals_centi' => 100])->assertOk();
    expectContractShape($res->json('data'), 'MealEntry');
    expect($res->json('data'))->toMatchArray([
        'member_id' => $m->id, 'entry_date' => '2026-11-05', 'breakfast' => null, 'lunch' => null, 'dinner' => null,
        'meals_centi' => 250, 'guest_meals_centi' => 100,
    ]);
    $row = MealEntry::find($res->json('data.id'));
    expect($row->month_id)->toBe($month->id)->and($row->entered_by_member_id)->toBe($me->id);
    expect(AuditLog::where('event', 'meal_entry.created')->where('mess_id', $mess->id)->count())->toBe(1);

    // Update: only meals sent -> guests keep their value; same row.
    $again = $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'meals_centi' => 300])->assertOk();
    expect($again->json('data.id'))->toBe($res->json('data.id'))->and($again->json('data.meals_centi'))->toBe(300)->and($again->json('data.guest_meals_centi'))->toBe(100);
    // Only guests sent -> meals keep their value.
    $guest = $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'guest_meals_centi' => 0])->assertOk();
    expect($guest->json('data.meals_centi'))->toBe(300)->and($guest->json('data.guest_meals_centi'))->toBe(0);
    expect(MealEntry::count())->toBe(1);
    expect(AuditLog::where('event', 'meal_entry.updated')->count())->toBe(2);
});

it('accepts zero, the max and half meals; rejects bad numbers and the wrong style fields', function (array $bad, string $field) {
    [$mess] = fmSetup('manager');
    $m = fmMember($mess);

    $this->putJson(messPath($mess, 'meals'), array_merge(['member_id' => $m->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100], $bad))
        ->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'negative' => [['meals_centi' => -50], 'meals_centi'],
    'float' => [['meals_centi' => 2.5], 'meals_centi'],
    'string float' => [['meals_centi' => '250.5'], 'meals_centi'],
    'not a half step' => [['meals_centi' => 125], 'meals_centi'],
    'over max' => [['meals_centi' => 1050], 'meals_centi'],
    'negative guests' => [['guest_meals_centi' => -50], 'guest_meals_centi'],
    'guest odd step' => [['guest_meals_centi' => 30], 'guest_meals_centi'],
    'ticks not allowed' => [['breakfast' => true], 'breakfast'],
    'bad date' => [['entry_date' => '05/11/2026'], 'entry_date'],
    'missing date' => [['entry_date' => null], 'entry_date'],
    'missing member' => [['member_id' => null], 'member_id'],
    'unknown member' => [['member_id' => 99999999], 'member_id'],
]);

it('accepts the boundary values', function () {
    [$mess] = fmSetup('manager');
    $m = fmMember($mess);

    foreach ([0, 50, 1000] as $i => $v) {
        $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-0'.($i + 2), 'meals_centi' => $v])
            ->assertOk()->assertJsonPath('data.meals_centi', $v);
    }
});

it('rejects an empty entry and a member of another mess', function () {
    [$mess] = fmSetup('manager');
    $m = fmMember($mess);
    $foreignMember = fmMember(otherMess());

    $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-05'])
        ->assertUnprocessable()->assertJsonValidationErrors(['meals_centi']);
    $this->putJson(messPath($mess, 'meals'), ['member_id' => $foreignMember->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors(['member_id']);
});

it('returns 404 for another mess', function () {
    [$mess] = fmSetup('manager');
    $foreign = otherMess();
    $m = fmMember($foreign);

    $this->putJson(messPath($foreign, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])->assertNotFound();
    $this->putJson(messPath($foreign, 'meals/bulk'), ['entries' => []])->assertNotFound();
});

// ---------------------------------------------------------------- bld_ticks

it('computes bld_ticks meals from the mess weights and rejects meals_centi', function () {
    [$mess] = fmSetup('manager', ['meal_tracking' => 'bld_ticks', 'breakfast_weight_centi' => 50, 'lunch_weight_centi' => 100, 'dinner_weight_centi' => 125]);
    $m = fmMember($mess);
    $url = messPath($mess, 'meals');
    $base = ['member_id' => $m->id, 'entry_date' => '2026-11-05'];

    $res = $this->putJson($url, $base + ['breakfast' => true, 'lunch' => false, 'dinner' => true, 'guest_meals_centi' => 100])->assertOk();
    expectContractShape($res->json('data'), 'MealEntry');
    expect($res->json('data'))->toMatchArray(['breakfast' => true, 'lunch' => false, 'dinner' => true, 'meals_centi' => 175, 'guest_meals_centi' => 100]);

    // Partial update merges with the stored ticks.
    $this->putJson($url, $base + ['lunch' => true])->assertOk()
        ->assertJsonPath('data.breakfast', true)->assertJsonPath('data.meals_centi', 275);

    // Guests only: ticks and meals untouched.
    $this->putJson($url, $base + ['guest_meals_centi' => 50])->assertOk()
        ->assertJsonPath('data.meals_centi', 275)->assertJsonPath('data.guest_meals_centi', 50);

    // A brand-new row with no ticks sent but guests: ticks false, meals 0.
    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-06', 'guest_meals_centi' => 50])->assertOk()
        ->assertJsonPath('data.meals_centi', 0)->assertJsonPath('data.breakfast', false);

    $this->putJson($url, $base + ['meals_centi' => 100])->assertUnprocessable()->assertJsonValidationErrors(['meals_centi']);
    $this->putJson($url, $base + ['breakfast' => 'yes'])->assertUnprocessable()->assertJsonValidationErrors(['breakfast']);
    $this->putJson($url, $base)->assertUnprocessable();
});

it('does not recompute existing rows when the weights change', function () {
    [$mess] = fmSetup('manager', ['meal_tracking' => 'bld_ticks']);
    $m = fmMember($mess);
    $url = messPath($mess, 'meals');

    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'breakfast' => true, 'lunch' => true])->assertOk()
        ->assertJsonPath('data.meals_centi', 150);
    $mess->update(['breakfast_weight_centi' => 25, 'lunch_weight_centi' => 75]);

    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-06', 'breakfast' => true, 'lunch' => true])->assertOk()
        ->assertJsonPath('data.meals_centi', 100);
    $old = $this->getJson(messPath($mess, 'meals'))->json('data.entries.0');
    expect($old['entry_date'])->toBe('2026-11-05')->and($old['meals_centi'])->toBe(150);
    // A guest-only touch of the old row does not recompute either.
    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'guest_meals_centi' => 50])->assertOk()
        ->assertJsonPath('data.meals_centi', 150);
});

// ---------------------------------------------------------------- month_total

it('keeps one row per member per month for month_total', function () {
    [$mess, , $month] = fmSetup('manager', ['meal_tracking' => 'month_total']);
    $m = fmMember($mess);
    $url = messPath($mess, 'meals');

    $res = $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-20', 'meals_centi' => 4500, 'guest_meals_centi' => 200])->assertOk();
    expectContractShape($res->json('data'), 'MealEntry');
    expect($res->json('data.entry_date'))->toBe('2026-11-01')->and($res->json('data.meals_centi'))->toBe(4500);

    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-03', 'meals_centi' => 5000])->assertOk()
        ->assertJsonPath('data.id', $res->json('data.id'))->assertJsonPath('data.guest_meals_centi', 200);
    expect(MealEntry::count())->toBe(1);
    expect(MealEntry::first()->month_id)->toBe($month->id);

    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-03', 'meals_centi' => 31050])->assertUnprocessable()->assertJsonValidationErrors(['meals_centi']);
    $this->putJson($url, ['member_id' => $m->id, 'entry_date' => '2026-11-03', 'meals_centi' => 31000])->assertOk();
});

it('lets a month_total entry through for a member who joined late in the month', function () {
    [$mess] = fmSetup('manager', ['meal_tracking' => 'month_total']);
    $late = fmMember($mess, ['joined_on' => '2026-11-20']);

    $this->putJson(messPath($mess, 'meals'), ['member_id' => $late->id, 'entry_date' => '2026-11-25', 'meals_centi' => 500])
        ->assertOk()->assertJsonPath('data.entry_date', '2026-11-01');
});

// ---------------------------------------------------------------- off / closed / range / dates

it('answers 409 meal_tracking_off for put and bulk', function () {
    [$mess] = fmSetup('manager', ['meal_tracking' => 'off']);
    $m = fmMember($mess);

    $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])
        ->assertStatus(409)->assertJsonPath('code', 'meal_tracking_off');
    $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => [['member_id' => $m->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100]]])
        ->assertStatus(409)->assertJsonPath('code', 'meal_tracking_off');
    expect(MealEntry::count())->toBe(0);
});

it('answers 409 month_closed for a closed month and never makes a late entry', function () {
    [$mess, $me] = actingAsMember('manager');
    fmMonth($mess, ['starts_on' => '2026-10-01', 'ends_on' => '2026-10-31', 'status' => 'closed']);
    $open = fmMonth($mess);
    $m = fmMember($mess, ['joined_on' => '2026-09-01']);

    $this->putJson(messPath($mess, 'meals'), ['member_id' => $m->id, 'entry_date' => '2026-10-10', 'meals_centi' => 100])
        ->assertStatus(409)->assertJsonPath('code', 'month_closed');
    expect(MealEntry::count())->toBe(0);
    expect($open->mealEntries()->count())->toBe(0);
});

it('rejects dates outside the member range, before the first month and in the future', function () {
    [$mess] = fmSetup('manager');
    $joinedLate = fmMember($mess, ['joined_on' => '2026-11-10']);
    $left = fmMember($mess, ['left_on' => '2026-11-15']);
    $url = messPath($mess, 'meals');

    $this->putJson($url, ['member_id' => $joinedLate->id, 'entry_date' => '2026-11-09', 'meals_centi' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors(['entry_date']);
    $this->putJson($url, ['member_id' => $joinedLate->id, 'entry_date' => '2026-11-10', 'meals_centi' => 100])->assertOk();
    $this->putJson($url, ['member_id' => $left->id, 'entry_date' => '2026-11-16', 'meals_centi' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors(['entry_date']);
    $this->putJson($url, ['member_id' => $left->id, 'entry_date' => '2026-11-15', 'meals_centi' => 100])->assertOk();
    $this->putJson($url, ['member_id' => $left->id, 'entry_date' => '2020-01-01', 'meals_centi' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors(['entry_date']);
    $this->putJson($url, ['member_id' => $left->id, 'entry_date' => '2027-06-01', 'meals_centi' => 100])
        ->assertUnprocessable()->assertJsonValidationErrors(['entry_date']);
});

// ---------------------------------------------------------------- who may write

it('meal_entry_by = manager: only the manager writes', function () {
    [$mess, $me] = fmSetup('member', ['meal_entry_by' => 'manager']);
    $url = messPath($mess, 'meals');

    $this->putJson($url, ['member_id' => $me->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])->assertForbidden();
    expect(MealEntry::count())->toBe(0);

    $manager = MessMember::find($mess->manager_member_id);
    $this->actingAs($manager->user);
    $this->putJson($url, ['member_id' => $me->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])->assertOk();
});

it('meal_entry_by = self: members write only their own row, the manager any row', function () {
    [$mess, $me] = fmSetup('member', ['meal_entry_by' => 'self']);
    $other = fmMember($mess);
    $url = messPath($mess, 'meals');

    $this->putJson($url, ['member_id' => $me->id, 'entry_date' => '2026-11-05', 'meals_centi' => 200])->assertOk();
    $this->putJson($url, ['member_id' => $other->id, 'entry_date' => '2026-11-05', 'meals_centi' => 200])->assertForbidden();

    $manager = MessMember::find($mess->manager_member_id);
    $this->actingAs($manager->user);
    $res = $this->putJson($url, ['member_id' => $me->id, 'entry_date' => '2026-11-05', 'meals_centi' => 150])->assertOk();
    $this->putJson($url, ['member_id' => $other->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])->assertOk();
    expect(MealEntry::find($res->json('data.id'))->entered_by_member_id)->toBe($manager->id);
});

it('does not let an archived member write', function () {
    [$mess, $me] = actingAsMember('archived');
    $mess->update(['meal_entry_by' => 'self']);
    fmMonth($mess, ['starts_on' => '2026-11-01']);

    $this->putJson(messPath($mess, 'meals'), ['member_id' => $me->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100])->assertForbidden();
});

// ---------------------------------------------------------------- bulk

it('bulk-saves entries in one go', function () {
    [$mess] = fmSetup('manager');
    $a = fmMember($mess);
    $b = fmMember($mess);
    MealEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => Month::first()->id, 'member_id' => $a->id, 'entry_date' => '2026-11-05', 'meals_centi' => 50, 'entered_by_member_id' => $a->id]);

    $res = $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => [
        ['member_id' => $a->id, 'entry_date' => '2026-11-05', 'meals_centi' => 200],
        ['member_id' => $b->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100, 'guest_meals_centi' => 50],
        ['member_id' => $b->id, 'entry_date' => '2026-11-06', 'meals_centi' => 150],
    ]])->assertOk();

    expect($res->json('data'))->toHaveCount(3);
    foreach ($res->json('data') as $row) {
        expectContractShape($row, 'MealEntry');
    }
    expect(MealEntry::count())->toBe(3)->and(MealEntry::where('member_id', $a->id)->value('meals_centi'))->toBe(200);
});

it('bulk works for bld_ticks and month_total styles', function () {
    [$mess] = fmSetup('manager', ['meal_tracking' => 'bld_ticks']);
    $a = fmMember($mess);
    $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => [
        ['member_id' => $a->id, 'entry_date' => '2026-11-05', 'breakfast' => true, 'lunch' => true, 'dinner' => true],
    ]])->assertOk()->assertJsonPath('data.0.meals_centi', 250);

    $mess->update(['meal_tracking' => 'month_total']);
    $res = $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => [
        ['member_id' => $a->id, 'entry_date' => '2026-11-15', 'meals_centi' => 4000],
    ]])->assertOk();
    expect($res->json('data.0.entry_date'))->toBe('2026-11-01');
});

it('bulk reports indexed 422 errors and saves nothing', function () {
    [$mess] = fmSetup('manager');
    $a = fmMember($mess);

    $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => [
        ['member_id' => $a->id, 'entry_date' => '2026-11-05', 'meals_centi' => 200],
        ['member_id' => $a->id, 'entry_date' => '2026-11-06', 'meals_centi' => -50],
        ['member_id' => 99999999, 'entry_date' => 'nope', 'meals_centi' => 100],
    ]])->assertUnprocessable()->assertJsonValidationErrors(['entries.1.meals_centi', 'entries.2.member_id', 'entries.2.entry_date']);
    expect(MealEntry::count())->toBe(0);

    $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => []])->assertUnprocessable()->assertJsonValidationErrors(['entries']);
    $this->putJson(messPath($mess, 'meals/bulk'), [])->assertUnprocessable()->assertJsonValidationErrors(['entries']);
});

it('bulk rolls back everything when a later item fails (range 422, closed 409, duplicate)', function () {
    [$mess] = actingAsMember('manager');
    fmMonth($mess, ['starts_on' => '2026-10-01', 'ends_on' => '2026-10-31', 'status' => 'closed']);
    fmMonth($mess);
    $a = fmMember($mess, ['joined_on' => '2026-09-01']);
    $late = fmMember($mess, ['joined_on' => '2026-11-10']);
    $good = ['member_id' => $a->id, 'entry_date' => '2026-11-05', 'meals_centi' => 200];
    $url = messPath($mess, 'meals/bulk');

    $this->putJson($url, ['entries' => [$good, ['member_id' => $late->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100]]])
        ->assertUnprocessable()->assertJsonValidationErrors(['entries.1.entry_date']);
    expect(MealEntry::count())->toBe(0);

    $this->putJson($url, ['entries' => [$good, ['member_id' => $a->id, 'entry_date' => '2026-10-05', 'meals_centi' => 100]]])
        ->assertStatus(409)->assertJsonPath('code', 'month_closed');
    expect(MealEntry::count())->toBe(0);

    $this->putJson($url, ['entries' => [$good, $good]])
        ->assertUnprocessable()->assertJsonValidationErrors(['entries.1.entry_date']);
    expect(MealEntry::count())->toBe(0);
});

it('bulk is manager only', function () {
    [$mess, $me] = fmSetup('member', ['meal_entry_by' => 'self']);

    $this->putJson(messPath($mess, 'meals/bulk'), ['entries' => [['member_id' => $me->id, 'entry_date' => '2026-11-05', 'meals_centi' => 100]]])
        ->assertForbidden();
    expect(MealEntry::count())->toBe(0);
});
