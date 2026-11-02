<?php

use App\Providers\OtpRateLimits;
use App\Services\Sms\FakeSender;
use App\Services\Sms\SmsSender;

/**
 * Makes the auth suite independent of bootstrap wiring: registers the rate limiters
 * and binds the in-memory SMS sender (tests never reach a real gateway).
 */
function cBootPhoneAuth(): FakeSender
{
    app()->register(OtpRateLimits::class);
    $fake = new FakeSender;
    app()->instance(SmsSender::class, $fake);

    return $fake;
}
