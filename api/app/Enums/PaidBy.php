<?php

namespace App\Enums;

enum PaidBy: string
{
    case Member = 'member';
    case Cash = 'cash';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
