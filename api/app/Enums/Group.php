<?php

namespace App\Enums;

enum Group: string
{
    case Fixed = 'fixed';
    case Meals = 'meals';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
