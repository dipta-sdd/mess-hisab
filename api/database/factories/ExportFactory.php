<?php

namespace Database\Factories;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Models\Export;
use App\Models\Mess;
use App\Models\MessMember;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Export>
 */
class ExportFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'requested_by_member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
            'type' => ExportType::Month,
            'status' => ExportStatus::Queued,
        ];
    }
}
