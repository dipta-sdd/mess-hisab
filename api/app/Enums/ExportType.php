<?php

namespace App\Enums;

enum ExportType: string
{
    case Month = 'month';
    case Statement = 'statement';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
