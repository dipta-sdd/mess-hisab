<?php

namespace Database\Factories;

use App\Models\Mess;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Mess>
 */
class MessFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true).' Mess',
            'created_by_user_id' => User::factory(),
        ];
    }
}
