<?php

namespace Database\Factories;

use App\Enums\MonthStatus;
use App\Models\Mess;
use App\Models\Month;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Month>
 */
class MonthFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'starts_on' => '2026-11-01',
            'ends_on' => '2026-11-30',
            'status' => MonthStatus::Open,
        ];
    }

    public function closed(): static
    {
        return $this->state(['status' => MonthStatus::Closed, 'closed_at' => now()]);
    }
}
