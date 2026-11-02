<?php

namespace App\Services\Month;

use App\Enums\MonthStatus;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Mess\MonthBoundary;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Month boundaries for one mess. Months are contiguous: the next month starts the day after the
 * previous one ends and runs to the day before the next `month_start_day` boundary
 * (MonthBoundary::endFor). The first month (made by MessCreator) may start off-boundary.
 *
 * Rules: never create a month before the first one; never create a month that starts after today
 * (Asia/Dhaka), except the one month that follows a closed current month; months created to fill a
 * gap are plain open months. Creation is serialised per mess by a row lock on `messes`, and
 * unique(mess_id, starts_on) is the backstop.
 */
class Calendar
{
    /** Today in the business timezone, at 00:00. */
    public function today(): Carbon
    {
        return Carbon::now(config('app.timezone', 'Asia/Dhaka'))->startOfDay();
    }

    /**
     * The month (any status) that contains $date; creates it (and any months before it) if missing.
     *
     * @throws CalendarException
     */
    public function monthFor(Mess $mess, CarbonInterface|string $date): Month
    {
        $day = $this->day($date);

        return $this->find($mess->id, $day)
            ?? $this->createThrough($mess->id, $day, allowFuture: false);
    }

    /**
     * Where a record dated $date belongs. A date inside a closed month goes to the current open
     * month and is flagged late.
     *
     * @return array{month: Month, is_late: bool}
     *
     * @throws CalendarException
     */
    public function assignMonth(Mess $mess, CarbonInterface|string $date): array
    {
        $month = $this->monthFor($mess, $date);

        if ($month->status === MonthStatus::Open) {
            return ['month' => $month, 'is_late' => false];
        }

        return ['month' => $this->currentMonth($mess), 'is_late' => true];
    }

    /**
     * The open month for today, created if missing. If today's month is closed, the first open month
     * after it (created if needed). If today is before the mess's first month, the first open month
     * from there on.
     *
     * @throws CalendarException
     */
    public function currentMonth(Mess $mess): Month
    {
        $today = $this->today();
        $first = $this->firstMonth($mess->id);

        $month = $today->lt($first->starts_on->copy()->startOfDay())
            ? $first
            : $this->monthFor($mess, $today);

        while ($month->status !== MonthStatus::Open) {
            $nextStart = $month->ends_on->copy()->startOfDay()->addDay();
            $month = $this->find($mess->id, $nextStart)
                ?? $this->createThrough($mess->id, $nextStart, allowFuture: true);
        }

        return $month;
    }

    private function day(CarbonInterface|string $date): Carbon
    {
        $tz = config('app.timezone', 'Asia/Dhaka');

        return ($date instanceof CarbonInterface
            ? Carbon::instance($date)->setTimezone($tz)
            : Carbon::parse($date, $tz))->startOfDay();
    }

    private function find(int $messId, Carbon $day): ?Month
    {
        $d = $day->toDateString();

        return Month::forMess($messId)->where('starts_on', '<=', $d)->where('ends_on', '>=', $d)->first();
    }

    private function firstMonth(int $messId): Month
    {
        return Month::forMess($messId)->orderBy('starts_on')->first()
            ?? throw new CalendarException('mess_has_no_months', 'This mess has no months yet.');
    }

    /** Creates every missing month after the latest one until $day is covered. Serialised per mess. */
    private function createThrough(int $messId, Carbon $day, bool $allowFuture): Month
    {
        $first = $this->firstMonth($messId);
        if ($day->lt($first->starts_on->copy()->startOfDay())) {
            throw new CalendarException('date_before_first_month', "That date is before the mess's first month.");
        }

        return DB::transaction(function () use ($messId, $day, $allowFuture) {
            // Row lock: a concurrent request waits here, then finds the months we made.
            $mess = Mess::query()->whereKey($messId)->lockForUpdate()->firstOrFail();

            if ($existing = $this->find($messId, $day)) {
                return $existing;
            }

            $today = $this->today();
            $month = Month::forMess($messId)->orderByDesc('ends_on')->firstOrFail();

            while ($month->ends_on->lt($day)) {
                $start = $month->ends_on->copy()->startOfDay()->addDay();
                if (! $allowFuture && $start->gt($today)) {
                    throw new CalendarException('date_in_future', 'That date is in a month that has not started yet.');
                }
                // Only the single follow-on month of a closed current month may start in the future.
                $allowFuture = false;

                $month = $this->make($mess, $month, $start);
            }

            return $month;
        });
    }

    private function make(Mess $mess, Month $previous, Carbon $start): Month
    {
        // Same recipe as MessCreator::firstMonth: deadline = month start + N-1 days.
        return Month::create([
            'mess_id' => $mess->id,
            'starts_on' => $start->toDateString(),
            'ends_on' => MonthBoundary::endFor($start, (int) $mess->month_start_day)->toDateString(),
            'status' => MonthStatus::Open,
            'fixed_deadline' => $start->copy()->addDays((int) $mess->fixed_due_day_offset - 1)->toDateString(),
            'deposit_deadline' => $start->copy()->addDays((int) $mess->deposit_due_day_offset - 1)->toDateString(),
            'deposit_paisa' => (int) $mess->deposit_paisa,
            'food_carry_in_paisa' => (int) $previous->food_carry_out_paisa,
        ]);
    }
}
