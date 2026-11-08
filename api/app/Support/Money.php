<?php

namespace App\Support;

class Money
{
    /** "Tk 1,344.01", "Tk 3,500", "-Tk 3,511". */
    public static function tk(int $paisa): string
    {
        $abs = abs($paisa);
        $body = number_format(intdiv($abs, 100)).($abs % 100 ? sprintf('.%02d', $abs % 100) : '');

        return ($paisa < 0 ? '-' : '').'Tk '.$body;
    }
}
