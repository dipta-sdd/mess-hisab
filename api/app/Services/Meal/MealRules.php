<?php

namespace App\Services\Meal;

use App\Enums\MealTracking;
use App\Models\Mess;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * Validation limits and rules for meal entries (centi-meals, never floats).
 *
 * Step: half meals (PROJECT §5 "2, 2.5") -> every typed amount is a multiple of 50.
 * Max per day: 10 meals (1000). Max per month (`month_total`): 310 meals (31 days x 10 = 31000).
 * Guest meals follow the same step and the same max as the style's own meals.
 * bld_ticks amounts are computed from the mess weights and are not step-checked.
 */
final class MealRules
{
    public const STEP_CENTI = 50;

    public const MAX_DAY_CENTI = 1000;

    public const MAX_MONTH_CENTI = 31000;

    public const MAX_BULK_ENTRIES = 1000;

    public static function style(Mess $mess): MealTracking
    {
        return $mess->meal_tracking instanceof MealTracking ? $mess->meal_tracking : MealTracking::from($mess->meal_tracking);
    }

    /** 409 meal_tracking_off when the mess does not track meals. */
    public static function assertTracking(Mess $mess): MealTracking
    {
        $style = self::style($mess);

        if ($style === MealTracking::Off) {
            throw new HttpResponseException(response()->json([
                'message' => 'Meal tracking is turned off for this mess.',
                'code' => 'meal_tracking_off',
            ], 409));
        }

        return $style;
    }

    /**
     * Rules for one entry. $prefix is '' for a single PUT or 'entries.*.' for bulk.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function entry(Mess $mess, string $prefix = ''): array
    {
        $style = self::style($mess);
        $max = $style === MealTracking::MonthTotal ? self::MAX_MONTH_CENTI : self::MAX_DAY_CENTI;
        $amount = ['integer', 'min:0', 'max:'.$max, 'multiple_of:'.self::STEP_CENTI];

        $rules = [
            'member_id' => ['required', 'integer', Rule::exists('mess_members', 'id')->where('mess_id', $mess->id)],
            'entry_date' => ['required', 'date_format:Y-m-d'],
            'guest_meals_centi' => ['sometimes', 'required', ...$amount],
        ];

        if ($style === MealTracking::BldTicks) {
            $rules['meals_centi'] = ['prohibited'];
            foreach (['breakfast', 'lunch', 'dinner'] as $tick) {
                $rules[$tick] = ['sometimes', 'required', 'boolean'];
            }
        } else {
            $rules['meals_centi'] = ['sometimes', 'required', ...$amount];
            foreach (['breakfast', 'lunch', 'dinner'] as $tick) {
                $rules[$tick] = ['prohibited'];
            }
        }

        $out = [];
        foreach ($rules as $field => $rule) {
            $out[$prefix.$field] = $rule;
        }

        return $out;
    }
}
