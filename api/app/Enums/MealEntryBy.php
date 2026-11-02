<?php

namespace App\Enums;

enum MealEntryBy: string
{
    case Manager = 'manager';
    case Self = 'self';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
