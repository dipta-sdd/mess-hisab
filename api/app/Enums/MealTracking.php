<?php

namespace App\Enums;

enum MealTracking: string
{
    case Off = 'off';
    case DailyNumber = 'daily_number';
    case BldTicks = 'bld_ticks';
    case MonthTotal = 'month_total';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
