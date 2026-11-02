<?php

namespace App\Exports;

/** Formatting edge: integer paisa / centi-meals to fixed 2-decimal strings, integer maths only. */
final class Money
{
    public static function taka(int $paisa): string
    {
        return self::fixed($paisa);
    }

    /** Centi-meals (100 = 1 meal) shown as meals with 2 decimals. */
    public static function meals(int $centi): string
    {
        return self::fixed($centi);
    }

    private static function fixed(int $hundredths): string
    {
        $sign = $hundredths < 0 ? '-' : '';
        $abs = abs($hundredths);

        return $sign.intdiv($abs, 100).'.'.str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }
}
