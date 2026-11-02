<?php

use App\Models\Month;
use Illuminate\Support\Carbon;

afterEach(fn () => Carbon::setTestNow());

function seedMonth($mess, string $start, string $end, bool $closed = false): Month
{
    $factory = Month::factory()->for($mess);

    return ($closed ? $factory->closed() : $factory)->create(['starts_on' => $start, 'ends_on' => $end]);
}

it('lists months newest first', function () {
    [$mess] = actingAsMember('member');
    seedMonth($mess, '2026-09-01', '2026-09-30', true);
    seedMonth($mess, '2026-11-01', '2026-11-30');
    seedMonth($mess, '2026-10-01', '2026-10-31', true);

    $res = $this->getJson(messPath($mess, 'months'))->assertOk();

    expect(collect($res->json('data'))->pluck('starts_on')->all())->toBe(['2026-11-01', '2026-10-01', '2026-09-01']);
    expectContractShape($res->json('data.0'), 'Month');
});

it('shows one month', function () {
    [$mess] = actingAsMember('member');
    $month = seedMonth($mess, '2026-11-01', '2026-11-30');

    $res = $this->getJson(messPath($mess, "months/{$month->id}"))->assertOk();

    expectContractShape($res->json('data'), 'Month');
    expect($res->json('data'))->toMatchArray(['id' => $month->id, 'starts_on' => '2026-11-01', 'ends_on' => '2026-11-30', 'status' => 'open']);
});

it('returns the existing open month as current', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-10 12:00', 'Asia/Dhaka'));
    [$mess] = actingAsMember('member');
    $month = seedMonth($mess, '2026-11-01', '2026-11-30');

    $res = $this->getJson(messPath($mess, 'months/current'))->assertOk();

    expectContractShape($res->json('data'), 'Month');
    expect($res->json('data.id'))->toBe($month->id)->and(Month::count())->toBe(1);
});

it('creates the open month for today when it is missing', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-10 12:00', 'Asia/Dhaka'));
    [$mess] = actingAsMember('member');
    $mess->update(['fixed_due_day_offset' => 7, 'deposit_due_day_offset' => 3, 'deposit_paisa' => 250000]);
    seedMonth($mess, '2026-11-01', '2026-11-30');

    $res = $this->getJson(messPath($mess, 'months/current'))->assertOk();

    expectContractShape($res->json('data'), 'Month');
    expect($res->json('data'))->toMatchArray([
        'starts_on' => '2026-12-01', 'ends_on' => '2026-12-31', 'status' => 'open',
        'fixed_deadline' => '2026-12-07', 'deposit_deadline' => '2026-12-03', 'deposit_paisa' => 250000,
    ]);
    expect(Month::count())->toBe(2);

    $this->getJson(messPath($mess, 'months/current'))->assertOk();
    expect(Month::count())->toBe(2);
});

it('returns 404 for a month of another mess', function () {
    [$mess] = actingAsMember('member');
    $foreign = seedMonth(otherMess(), '2026-11-01', '2026-11-30');

    $this->getJson(messPath($mess, "months/{$foreign->id}"))->assertNotFound();
    $this->getJson(messPath($mess, 'months/999999'))->assertNotFound();
});

it('does not list months of another mess', function () {
    [$mess] = actingAsMember('member');
    seedMonth(otherMess(), '2026-11-01', '2026-11-30');

    $this->getJson(messPath($mess, 'months'))->assertOk()->assertJsonCount(0, 'data');
});

it('hides a mess from non-members', function () {
    actingAsMember('member');
    $other = otherMess();

    $this->getJson(messPath($other, 'months'))->assertNotFound();
    $this->getJson(messPath($other, 'months/current'))->assertNotFound();
});

it('requires authentication', function () {
    $this->getJson(messPath(otherMess(), 'months'))->assertUnauthorized();
});

it('lets every role read months', function (string $role) {
    Carbon::setTestNow(Carbon::parse('2026-11-10 12:00', 'Asia/Dhaka'));
    [$mess] = actingAsMember($role);
    seedMonth($mess, '2026-11-01', '2026-11-30');

    $this->getJson(messPath($mess, 'months'))->assertOk();
    $this->getJson(messPath($mess, 'months/current'))->assertOk();
})->with(['member', 'manager', 'admin', 'archived']);

it('treats a non-numeric month id as not found', function () {
    [$mess] = actingAsMember('member');

    $this->getJson(messPath($mess, 'months/abc'))->assertNotFound();
});
