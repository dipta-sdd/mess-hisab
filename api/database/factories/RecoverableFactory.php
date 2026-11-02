<?php

namespace Database\Factories;

use App\Enums\DoesntPayMode;
use App\Enums\RecoverableStatus;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Recoverable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Recoverable>
 */
class RecoverableFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'debtor_member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'mode' => DoesntPayMode::Equal,
            'status' => RecoverableStatus::Pending,
            'created_by_member_id' => fn (array $a) => $a['debtor_member_id'],
        ];
    }
}
