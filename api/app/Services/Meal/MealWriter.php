<?php

namespace App\Services\Meal;

use App\Enums\MealEntryBy;
use App\Enums\MealTracking;
use App\Models\MealEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;

/**
 * Upserts one meal entry (one row per member per day; per month for `month_total`).
 * Existing rows are never recomputed when mess settings change: weights are read only when a
 * bld_ticks entry is written. Audit rows come from MealEntry's Auditable trait.
 */
class MealWriter
{
    public function __construct(private Calendar $calendar) {}

    /**
     * @param  array<string, mixed>  $d  validated payload
     * @param  string  $prefix  error key prefix for bulk ('entries.3.')
     *
     * @throws ValidationException|HttpResponseException
     */
    public function upsert(Mess $mess, MessMember $actor, array $d, string $prefix = ''): MealEntry
    {
        $style = MealRules::assertTracking($mess);

        $this->authorize($mess, $actor, (int) $d['member_id']);

        $member = MessMember::forMess($mess->id)->findOrFail((int) $d['member_id']);
        $month = $this->month($mess, $d['entry_date'], $prefix);

        if (! $month->isOpen()) {
            throw new HttpResponseException(response()->json([
                'message' => 'This month is closed.',
                'code' => 'month_closed',
            ], 409));
        }

        $date = $style === MealTracking::MonthTotal ? $month->starts_on->toDateString() : $d['entry_date'];
        $this->assertMemberActive($member, $month, $style, $d['entry_date'], $prefix);

        $existing = MealEntry::query()->where('member_id', $member->id)->where('entry_date', $date)->first();
        $values = $this->values($mess, $style, $d, $existing, $prefix);

        if ($existing) {
            $existing->update($values + ['entered_by_member_id' => $actor->id]);

            return $existing->fresh();
        }

        return MealEntry::create($values + [
            'mess_id' => $mess->id,
            'month_id' => $month->id,
            'member_id' => $member->id,
            'entry_date' => $date,
            'entered_by_member_id' => $actor->id,
        ])->fresh();
    }

    /** meal_entry_by = manager: only the manager. self: a member only for their own row. Manager always. */
    private function authorize(Mess $mess, MessMember $actor, int $memberId): void
    {
        if ($actor->isManager()) {
            return;
        }

        $by = $mess->meal_entry_by instanceof MealEntryBy ? $mess->meal_entry_by : MealEntryBy::from($mess->meal_entry_by);

        if ($by !== MealEntryBy::Self) {
            abort(403, 'Only the manager enters meals in this mess.');
        }
        if ($memberId !== $actor->id) {
            abort(403, 'You can only enter your own meals.');
        }
    }

    private function month(Mess $mess, string $date, string $prefix): Month
    {
        try {
            return $this->calendar->monthFor($mess, $date);
        } catch (CalendarException $e) {
            throw ValidationException::withMessages([$prefix.'entry_date' => [$e->getMessage()]]);
        }
    }

    /** Day styles: the date is inside joined_on..left_on. month_total: active in the month (CONTRACT §3). */
    private function assertMemberActive(MessMember $member, Month $month, MealTracking $style, string $date, string $prefix): void
    {
        if ($style === MealTracking::MonthTotal) {
            $ok = $member->joined_on->lte($month->ends_on) && ($member->left_on === null || $member->left_on->gte($month->starts_on));
        } else {
            $ok = $member->joined_on->toDateString() <= $date
                && ($member->left_on === null || $member->left_on->toDateString() >= $date);
        }

        if (! $ok) {
            throw ValidationException::withMessages([
                $prefix.'entry_date' => ['This member was not in the mess on that date.'],
            ]);
        }
    }

    /**
     * Columns to write. Omitted fields keep the existing row's value (0 / null on a new row).
     *
     * @return array<string, mixed>
     */
    private function values(Mess $mess, MealTracking $style, array $d, ?MealEntry $existing, string $prefix): array
    {
        $hasGuest = array_key_exists('guest_meals_centi', $d);
        $out = [];

        if ($style === MealTracking::BldTicks) {
            $sent = array_intersect_key($d, array_flip(['breakfast', 'lunch', 'dinner']));
            if ($sent === [] && ! $hasGuest) {
                $this->nothingToWrite($prefix);
            }
            if ($sent !== [] || $existing === null) {
                $ticks = [
                    'breakfast' => (bool) ($d['breakfast'] ?? $existing?->breakfast ?? false),
                    'lunch' => (bool) ($d['lunch'] ?? $existing?->lunch ?? false),
                    'dinner' => (bool) ($d['dinner'] ?? $existing?->dinner ?? false),
                ];
                $out = $ticks + ['meals_centi' => $this->weighted($mess, $ticks)];
            }
        } else {
            if (! array_key_exists('meals_centi', $d) && ! $hasGuest) {
                $this->nothingToWrite($prefix);
            }
            if (array_key_exists('meals_centi', $d)) {
                $out['meals_centi'] = (int) $d['meals_centi'];
            } elseif ($existing === null) {
                $out['meals_centi'] = 0;
            }
        }

        if ($hasGuest) {
            $out['guest_meals_centi'] = (int) $d['guest_meals_centi'];
        } elseif ($existing === null) {
            $out['guest_meals_centi'] = 0;
        }

        return $out;
    }

    /** @param array{breakfast: bool, lunch: bool, dinner: bool} $ticks */
    public function weighted(Mess $mess, array $ticks): int
    {
        return ($ticks['breakfast'] ? (int) $mess->breakfast_weight_centi : 0)
            + ($ticks['lunch'] ? (int) $mess->lunch_weight_centi : 0)
            + ($ticks['dinner'] ? (int) $mess->dinner_weight_centi : 0);
    }

    private function nothingToWrite(string $prefix): never
    {
        throw ValidationException::withMessages([
            $prefix.'meals_centi' => ['Send the meals (or ticks) and/or guest_meals_centi to record.'],
        ]);
    }
}
