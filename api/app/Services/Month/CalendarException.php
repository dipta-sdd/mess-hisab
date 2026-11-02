<?php

namespace App\Services\Month;

use RuntimeException;

/**
 * A date cannot be placed in a month. $reason is a snake_case code callers can map to a
 * 409/422: `date_before_first_month`, `date_in_future`, `mess_has_no_months`.
 */
class CalendarException extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
