<?php

namespace Database\Factories;

use App\Models\MealEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MealEntry>
 */
class MealEntryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'entry_date' => '2026-11-05',
            'meals_centi' => 200,
            'guest_meals_centi' => 0,
            'entered_by_member_id' => fn (array $a) => $a['member_id'],
        ];
    }
}
