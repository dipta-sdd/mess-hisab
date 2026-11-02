<?php

namespace App\Services\Payment;

use App\Models\Mess;
use App\Models\Month;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;

/**
 * The single place Task G finds "the month a payment date belongs to".
 * Delegates to Calendar::monthFor(), which creates missing (gap) months up to today's.
 */
class PaymentMonth
{
    /** @throws ValidationException the date can't be placed in a month (422 on paid_on) */
    public static function find(Mess $mess, string $date): Month
    {
        try {
            return app(Calendar::class)->monthFor($mess, $date);
        } catch (CalendarException $e) {
            throw ValidationException::withMessages(['paid_on' => [$e->getMessage()]]);
        }
    }

    /** The open month of that date; a closed one gives 409 month_closed. */
    public static function for(Mess $mess, string $date): Month
    {
        $month = self::find($mess, $date);
        self::assertOpen($month);

        return $month;
    }

    public static function assertOpen(Month $month): void
    {
        if (! $month->isOpen()) {
            throw new HttpResponseException(response()->json([
                'message' => 'This month is closed.',
                'code' => 'month_closed',
            ], 409));
        }
    }
}
