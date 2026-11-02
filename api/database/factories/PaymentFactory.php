<?php

namespace Database\Factories;

use App\Enums\Group;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Payment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Payment>
 */
class PaymentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'group' => Group::Fixed,
            'amount_paisa' => 100000,
            'paid_on' => '2026-11-03',
            'received_by_member_id' => fn (array $a) => $a['member_id'],
            'created_by_member_id' => fn (array $a) => $a['member_id'],
        ];
    }
}
