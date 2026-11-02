<?php

namespace Database\Factories;

use App\Enums\OtpPurpose;
use App\Models\PhoneOtp;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<PhoneOtp>
 */
class PhoneOtpFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => null,
            'phone' => '017'.fake()->unique()->numerify('########'),
            'purpose' => OtpPurpose::Verify,
            'code_hash' => Hash::make('123456'),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(5),
            'sent_at' => now(),
        ];
    }

    /** The plain code to store (hashed). */
    public function code(string $code): static
    {
        return $this->state(fn () => ['code_hash' => Hash::make($code)]);
    }

    public function expired(): static
    {
        return $this->state(fn () => ['expires_at' => now()->subMinute()]);
    }
}
