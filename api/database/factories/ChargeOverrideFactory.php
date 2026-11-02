<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\ChargeOverride;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ChargeOverride>
 */
class ChargeOverrideFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'category_id' => fn (array $a) => Category::factory()->state(['mess_id' => $a['mess_id']]),
            'member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'amount_paisa' => 200000,
        ];
    }
}
