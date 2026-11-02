<?php

namespace App\Services\Sms;

use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class SmsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SmsSender::class, fn () => match (config('services.sms.driver')) {
            'bulksmsbd' => new BulkSmsBdSender,
            'log' => new LogSender,
            default => throw new InvalidArgumentException('Unknown SMS driver ['.config('services.sms.driver').'].'),
        });
    }
}
