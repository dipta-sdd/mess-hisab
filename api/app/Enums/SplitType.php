<?php

namespace App\Enums;

enum SplitType: string
{
    case Equal = 'equal';
    case FixedPerPerson = 'fixed_per_person';
    case ByMeal = 'by_meal';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
