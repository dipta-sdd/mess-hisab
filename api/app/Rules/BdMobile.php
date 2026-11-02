<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A Bangladesh mobile number. Stored in the local form `01XXXXXXXXX` (11 digits); `+880…`,
 * `880…`, spaces and dashes are accepted and normalised. Ported from the POS app's CanonicalMobile.
 */
class BdMobile implements ValidationRule
{
    public const PATTERN = '/^01[3-9]\d{8}$/';

    /** The canonical `01XXXXXXXXX` form, or the digits as typed when they can't be normalised. */
    public static function normalize(?string $value): string
    {
        $digits = preg_replace('/\D+/', '', (string) $value) ?? '';
        if (str_starts_with($digits, '880')) {
            $digits = '0'.substr($digits, 3);
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '1')) {
            $digits = '0'.$digits;
        }

        return $digits;
    }

    public static function isValid(?string $value): bool
    {
        return preg_match(self::PATTERN, self::normalize($value)) === 1;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! self::isValid($value)) {
            $fail('validation.bd_mobile')->translate();
        }
    }
}
