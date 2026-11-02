<?php

namespace Database\Factories;

use App\Models\Mess;
use App\Models\MessMember;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MessMember>
 */
class MessMemberFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'user_id' => User::factory(),
            'display_name' => fake()->firstName(),
            'joined_on' => '2026-11-01',
        ];
    }

    /** A member slot with no account yet (waiting for an invite). */
    public function placeholder(): static
    {
        return $this->state(['user_id' => null]);
    }

    public function archived(): static
    {
        return $this->state(['left_on' => '2026-11-15', 'archived_at' => now()]);
    }
}
