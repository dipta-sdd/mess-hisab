<?php

namespace App\Jobs\Sms;

use App\Services\Sms\SmsSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * One notification text. Never retried and never blocks a money action: a gateway failure is only logged
 * (without the phone number).
 */
class SendSms implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public function __construct(public readonly string $phone, public readonly string $message)
    {
        $this->afterCommit();
    }

    public function handle(SmsSender $sms): void
    {
        try {
            $sms->send($this->phone, $this->message);
        } catch (Throwable $e) {
            Log::warning('Member SMS failed: '.$e->getMessage());
        }
    }
}
