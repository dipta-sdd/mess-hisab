<?php

namespace Database\Factories;

use App\Enums\Group;
use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LedgerEntry>
 */
class LedgerEntryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'group' => Group::Fixed,
            'type' => LedgerType::Adjustment,
            'amount_paisa' => 10000,
        ];
    }
}
