<?php

namespace App\Enums;

enum ZeroMealResolution: string
{
    case SplitEqual = 'split_equal';
    case Carry = 'carry';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
