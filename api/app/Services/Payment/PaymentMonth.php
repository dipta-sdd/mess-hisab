<?php

namespace App\Services\Payment;

use App\Models\Mess;
use App\Models\Month;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;

/**
 * The single place Task G finds "the month a payment date belongs to".
 * TODO(lead): switch the lookup to App\Services\Month\Calendar::monthFor() on merge (Task M).
 * Never creates months.
 */
class PaymentMonth
{
    /** @throws ValidationException no month covers the date (422 on paid_on) */
    public static function find(Mess $mess, string $date): Month
    {
        $month = Month::query()->forMess($mess->id)
            ->whereDate('starts_on', '<=', $date)
            ->whereDate('ends_on', '>=', $date)
            ->first();

        if ($month === null) {
            throw ValidationException::withMessages(['paid_on' => ['There is no month for this date.']]);
        }

        return $month;
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
