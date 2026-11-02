<?php

namespace App\Enums;

enum Locale: string
{
    case En = 'en';
    case Bn = 'bn';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
