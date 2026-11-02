<?php

namespace App\Services\Mess;

use Illuminate\Support\Carbon;

/**
 * Minimal month-boundary maths for the first month only. Task M's Calendar
 * owns every later month and must agree with this: a month runs from a
 * boundary (day = month_start_day) to the day before the next boundary.
 */
class MonthBoundary
{
    /** Last day of the month that starts on $startsOn (day before the next month_start_day boundary). */
    public static function endFor(Carbon $startsOn, int $monthStartDay): Carbon
    {
        $next = $startsOn->copy()->startOfDay()->day($monthStartDay);
        if ($next->lte($startsOn)) {
            $next = $startsOn->copy()->startOfDay()->startOfMonth()->addMonthNoOverflow()->day($monthStartDay);
        }

        return $next->subDay();
    }
}
