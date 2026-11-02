<?php

namespace Database\Factories;

use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Recoverable;
use App\Models\RecoverableShare;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RecoverableShare>
 */
class RecoverableShareFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'recoverable_id' => fn (array $a) => Recoverable::factory()->state(['mess_id' => $a['mess_id']]),
            'member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
        ];
    }
}
