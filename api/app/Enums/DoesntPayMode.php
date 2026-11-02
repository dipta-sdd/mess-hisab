<?php

namespace App\Enums;

enum DoesntPayMode: string
{
    case Equal = 'equal';
    case ByMeals = 'by_meals';
    case Manual = 'manual';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
