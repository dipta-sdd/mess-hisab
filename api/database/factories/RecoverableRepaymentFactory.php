<?php

namespace Database\Factories;

use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Recoverable;
use App\Models\RecoverableRepayment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RecoverableRepayment>
 */
class RecoverableRepaymentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'recoverable_id' => fn (array $a) => Recoverable::factory()->state(['mess_id' => $a['mess_id']]),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'amount_paisa' => 10000,
            'paid_on' => '2026-11-10',
            'created_by_member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
        ];
    }
}
