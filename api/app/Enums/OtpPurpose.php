<?php

namespace App\Enums;

/** Why an SMS code was sent: signup verification, password reset, or a phone-number change. */
enum OtpPurpose: string
{
    case Verify = 'verify';
    case Reset = 'reset';
    case Change = 'change';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
