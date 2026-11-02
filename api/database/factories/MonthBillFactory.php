<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Mess;
use App\Models\Month;
use App\Models\MonthBill;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MonthBill>
 */
class MonthBillFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'category_id' => fn (array $a) => Category::factory()->state(['mess_id' => $a['mess_id']]),
            'amount_paisa' => 90000,
        ];
    }
}
