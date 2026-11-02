<?php

namespace App\Enums;

enum RoundingMode: string
{
    case WholeTaka = 'whole_taka';
    case RoundUp = 'round_up';
    case TwoDecimals = 'two_decimals';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
