<?php

use App\Providers\AppServiceProvider;

return [
    AppServiceProvider::class,
    App\Providers\OtpRateLimits::class,
    App\Services\Sms\SmsServiceProvider::class,
];
