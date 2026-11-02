<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Log;

/** Writes the text to the Laravel log instead of sending it (local dev). */
class LogSender implements SmsSender
{
    public function send(string $phone, string $message): void
    {
        Log::info("SMS to {$phone}: {$message}");
    }
}
