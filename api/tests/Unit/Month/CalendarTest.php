<?php

use App\Models\Mess;
use App\Models\Month;
use App\Models\User;
use App\Services\Mess\MessCreator;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

afterEach(fn () => Carbon::setTestNow());

/** A real mess with its first month, built the way production does it. */
function calendarMess(int $startDay, string $firstStart, array $messAttrs = []): Mess
{
    [$mess] = app(MessCreator::class)->create(User::factory()->create(), [
        'name' => 'Test', 'month_start_day' => $startDay, 'first_month_starts_on' => $firstStart, 'creator_display_name' => 'Me',
    ]);
    if ($messAttrs) {
        $mess->update($messAttrs);
    }

    return $mess->fresh();
}

function now_in_dhaka(string $datetime): void
{
    Carbon::setTestNow(Carbon::parse($datetime, 'Asia/Dhaka'));
}

/** @return list<string> "start..end" of every month, oldest first */
function ranges(Mess $mess): array
{
    return Month::forMess($mess->id)->orderBy('starts_on')->get()
        ->map(fn ($m) => $m->starts_on->toDateString().'..'.$m->ends_on->toDateString())->all();
}

it('builds calendar months for start day 1, including a leap and a non-leap February', function () {
    now_in_dhaka('2028-03-05 10:00');
    $mess = calendarMess(1, '2027-12-01');

    app(Calendar::class)->monthFor($mess, '2028-03-02');

    expect(ranges($mess))->toBe([
        '2027-12-01..2027-12-31', '2028-01-01..2028-01-31', '2028-02-01..2028-02-29', '2028-03-01..2028-03-31',
    ]);

    now_in_dhaka('2027-03-05 10:00');
    $mess = calendarMess(1, '2027-01-01');
    app(Calendar::class)->monthFor($mess, '2027-03-02');
    expect(ranges($mess))->toContain('2027-02-01..2027-02-28');
});

it('builds months for start day 28 across the year end and February', function () {
    now_in_dhaka('2027-03-10 10:00');
    $mess = calendarMess(28, '2026-11-28');

    $month = app(Calendar::class)->monthFor($mess, '2027-03-10');

    expect(ranges($mess))->toBe([
        '2026-11-28..2026-12-27', '2026-12-28..2027-01-27', '2027-01-28..2027-02-27', '2027-02-28..2027-03-27',
    ]);
    expect($month->starts_on->toDateString())->toBe('2027-02-28');
});

it('keeps an off-boundary first month and then snaps to the boundary', function () {
    now_in_dhaka('2026-12-20 10:00');
    $mess = calendarMess(10, '2026-10-25');

    app(Calendar::class)->monthFor($mess, '2026-12-20');

    expect(ranges($mess))->toBe(['2026-10-25..2026-11-09', '2026-11-10..2026-12-09', '2026-12-10..2027-01-09']);
});

it('agrees with the first month MessCreator makes when the first month starts on a boundary', function () {
    now_in_dhaka('2026-12-20 10:00');
    $mess = calendarMess(5, '2026-11-05');
    $first = Month::forMess($mess->id)->sole();
    expect($first->ends_on->toDateString())->toBe('2026-12-04');

    $next = app(Calendar::class)->monthFor($mess, '2026-12-05');

    expect($next->starts_on->toDateString())->toBe('2026-12-05')->and($next->ends_on->toDateString())->toBe('2027-01-04');
});

it('returns the existing month for a date inside it, closed or open', function () {
    now_in_dhaka('2026-11-20 10:00');
    $mess = calendarMess(1, '2026-11-01');
    $first = Month::forMess($mess->id)->sole();

    expect(app(Calendar::class)->monthFor($mess, '2026-11-01')->id)->toBe($first->id)
        ->and(app(Calendar::class)->monthFor($mess, '2026-11-30')->id)->toBe($first->id);

    $first->update(['status' => 'closed']);
    expect(app(Calendar::class)->monthFor($mess, '2026-11-15')->id)->toBe($first->id);
});

it('copies deadlines and deposit from the mess the way MessCreator does', function () {
    now_in_dhaka('2026-12-20 10:00');
    $mess = calendarMess(1, '2026-11-01', ['fixed_due_day_offset' => 7, 'deposit_due_day_offset' => 1, 'deposit_paisa' => 300000]);

    $month = app(Calendar::class)->monthFor($mess, '2026-12-01');

    expect($month->fixed_deadline->toDateString())->toBe('2026-12-07')
        ->and($month->deposit_deadline->toDateString())->toBe('2026-12-01')
        ->and($month->deposit_paisa)->toBe(300000)
        ->and($month->status->value)->toBe('open');
});

it('uses the current month_start_day for months created after a settings change', function () {
    now_in_dhaka('2026-12-20 10:00');
    $mess = calendarMess(1, '2026-11-01');
    $mess->update(['month_start_day' => 15]);

    app(Calendar::class)->monthFor($mess->fresh(), '2026-12-20');

    // Nov stays as it was; Dec runs from the day after it to the day before the next 15th.
    expect(ranges($mess))->toBe(['2026-11-01..2026-11-30', '2026-12-01..2026-12-14', '2026-12-15..2027-01-14']);
});

it('fills gaps with contiguous open months and never overlaps', function () {
    now_in_dhaka('2027-03-15 10:00');
    $mess = calendarMess(1, '2026-11-01');

    app(Calendar::class)->monthFor($mess, '2027-03-15');

    $months = Month::forMess($mess->id)->orderBy('starts_on')->get();
    expect($months)->toHaveCount(5);
    foreach ($months->skip(1)->values() as $i => $m) {
        expect($m->starts_on->toDateString())->toBe($months[$i]->ends_on->copy()->addDay()->toDateString())
            ->and($m->status->value)->toBe('open');
    }

    app(Calendar::class)->monthFor($mess, '2027-02-10');
    expect(Month::forMess($mess->id)->count())->toBe(5);
});

it('never creates a month before the first month', function () {
    now_in_dhaka('2026-11-20 10:00');
    $mess = calendarMess(1, '2026-11-01');

    expect(fn () => app(Calendar::class)->monthFor($mess, '2026-10-31'))
        ->toThrow(CalendarException::class);
    expect(Month::forMess($mess->id)->count())->toBe(1);

    try {
        app(Calendar::class)->assignMonth($mess, '2026-01-01');
    } catch (CalendarException $e) {
        expect($e->reason)->toBe('date_before_first_month');
    }
});

it('refuses to create months that have not started yet', function () {
    now_in_dhaka('2026-11-20 10:00');
    $mess = calendarMess(1, '2026-11-01');

    try {
        app(Calendar::class)->monthFor($mess, '2026-12-05');
        $this->fail('expected exception');
    } catch (CalendarException $e) {
        expect($e->reason)->toBe('date_in_future');
    }
    expect(Month::forMess($mess->id)->count())->toBe(1);
});

it('puts a date in a closed month into the current open month, marked late', function () {
    now_in_dhaka('2026-12-10 10:00');
    $mess = calendarMess(1, '2026-11-01');
    Month::forMess($mess->id)->sole()->update(['status' => 'closed']);

    $result = app(Calendar::class)->assignMonth($mess, '2026-11-12');

    expect($result['is_late'])->toBeTrue()
        ->and($result['month']->starts_on->toDateString())->toBe('2026-12-01')
        ->and($result['month']->status->value)->toBe('open');
});

it('does not mark a date in an open month as late', function () {
    now_in_dhaka('2026-12-10 10:00');
    $mess = calendarMess(1, '2026-11-01');

    $result = app(Calendar::class)->assignMonth($mess, '2026-12-03');

    expect($result['is_late'])->toBeFalse()->and($result['month']->starts_on->toDateString())->toBe('2026-12-01');
});

it('moves to the following month when the current one is closed', function () {
    now_in_dhaka('2026-11-20 10:00');
    $mess = calendarMess(1, '2026-11-01');
    Month::forMess($mess->id)->sole()->update(['status' => 'closed']);

    $current = app(Calendar::class)->currentMonth($mess);

    expect($current->starts_on->toDateString())->toBe('2026-12-01')->and($current->status->value)->toBe('open');
    expect(app(Calendar::class)->currentMonth($mess)->id)->toBe($current->id);
    expect(Month::forMess($mess->id)->count())->toBe(2);

    // A late record in the closed month still lands there.
    expect(app(Calendar::class)->assignMonth($mess, '2026-11-18'))->toMatchArray(['is_late' => true]);
});

it('uses the first month while today is before it', function () {
    now_in_dhaka('2026-10-20 10:00');
    $mess = calendarMess(1, '2026-11-01');

    expect(app(Calendar::class)->currentMonth($mess)->starts_on->toDateString())->toBe('2026-11-01');
    expect(Month::forMess($mess->id)->count())->toBe(1);
});

it('decides "today" in Asia/Dhaka, not UTC', function () {
    // 20:00 UTC on 30 Nov is 02:00 on 1 Dec in Dhaka.
    Carbon::setTestNow(Carbon::parse('2026-11-30 20:00:00', 'UTC'));
    $mess = calendarMess(1, '2026-11-01');

    expect(app(Calendar::class)->currentMonth($mess)->starts_on->toDateString())->toBe('2026-12-01');
});

it('copies the previous month food carry into a new month', function () {
    now_in_dhaka('2026-12-10 10:00');
    $mess = calendarMess(1, '2026-11-01');
    Month::forMess($mess->id)->sole()->update(['food_carry_out_paisa' => 123400]);

    expect(app(Calendar::class)->monthFor($mess, '2026-12-02')->food_carry_in_paisa)->toBe(123400);
});

it('is safe to call again after another process already made the month', function () {
    now_in_dhaka('2026-12-10 10:00');
    $mess = calendarMess(1, '2026-11-01');
    // Simulates the second of two concurrent requests: the row exists by the time it looks.
    Month::create(['mess_id' => $mess->id, 'starts_on' => '2026-12-01', 'ends_on' => '2026-12-31', 'status' => 'open']);

    app(Calendar::class)->monthFor($mess, '2026-12-05');

    expect(Month::forMess($mess->id)->count())->toBe(2);
});
