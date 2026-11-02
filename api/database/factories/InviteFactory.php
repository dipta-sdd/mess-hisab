<?php

namespace Database\Factories;

use App\Models\Invite;
use App\Models\Mess;
use App\Models\MessMember;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Invite>
 */
class InviteFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'token' => Str::random(40),
            'created_by_member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
        ];
    }
}
