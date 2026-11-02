<?php

namespace Database\Factories;

use App\Models\MemberMonthSetting;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MemberMonthSetting>
 */
class MemberMonthSettingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'deposit_paisa' => null,
            'min_meals_centi' => null,
        ];
    }
}
