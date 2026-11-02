<?php

namespace App\Enums;

enum LedgerType: string
{
    case Opening = 'opening';
    case Charge = 'charge';
    case Rounding = 'rounding';
    case Adjustment = 'adjustment';
    case DoesntPayOut = 'doesnt_pay_out';
    case DoesntPayIn = 'doesnt_pay_in';
    case RecoverableRepay = 'recoverable_repay';
    case FinalPayout = 'final_payout';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
