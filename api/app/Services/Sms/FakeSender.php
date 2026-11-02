<?php

namespace App\Services\Sms;

use Illuminate\Support\Arr;
use PHPUnit\Framework\Assert;

/** In-memory sender for tests. */
class FakeSender implements SmsSender
{
    /** @var list<array{phone: string, message: string}> */
    public array $sent = [];

    public bool $failing = false;

    public function send(string $phone, string $message): void
    {
        if ($this->failing) {
            throw new SmsFailed('Fake sender is set to fail.');
        }
        $this->sent[] = ['phone' => $phone, 'message' => $message];
    }

    public function failNext(bool $fail = true): static
    {
        $this->failing = $fail;

        return $this;
    }

    /** @return list<array{phone: string, message: string}> */
    public function sentTo(string $phone): array
    {
        return array_values(array_filter($this->sent, fn (array $s) => $s['phone'] === $phone));
    }

    public function assertSentTo(string $phone, ?int $times = null): void
    {
        $count = count($this->sentTo($phone));
        $times === null
            ? Assert::assertGreaterThan(0, $count, "No SMS was sent to {$phone}.")
            : Assert::assertSame($times, $count, "Expected {$times} SMS to {$phone}, got {$count}.");
    }

    public function assertNothingSent(): void
    {
        Assert::assertSame([], $this->sent, 'An SMS was sent.');
    }

    /** The 6-digit code in the last text sent to the phone. */
    public function lastCode(string $phone): ?string
    {
        $last = Arr::last($this->sentTo($phone));

        return $last && preg_match('/\d{6}/', $last['message'], $m) ? $m[0] : null;
    }
}
