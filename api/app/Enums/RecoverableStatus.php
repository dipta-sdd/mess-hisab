<?php

namespace App\Enums;

enum RecoverableStatus: string
{
    case Pending = 'pending';
    case Open = 'open';
    case Settled = 'settled';
    case Undone = 'undone';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
