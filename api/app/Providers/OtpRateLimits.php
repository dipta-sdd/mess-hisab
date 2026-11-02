<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class OtpRateLimits extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('otp-send', fn (Request $request) => $this->limits($request, 'send', 3, 10));
        RateLimiter::for('otp-verify', fn (Request $request) => $this->limits($request, 'verify', 5, 20));
    }

    /** Per-minute and per-hour caps, each by IP and (when signed in) by user id. Keys differ so the windows don't share a counter. */
    private function limits(Request $request, string $name, int $perMinute, int $perHour): array
    {
        $limits = [
            Limit::perMinute($perMinute)->by("$name:m:ip:{$request->ip()}"),
            Limit::perHour($perHour)->by("$name:h:ip:{$request->ip()}"),
        ];
        if ($id = $request->user()?->getAuthIdentifier()) {
            $limits[] = Limit::perMinute($perMinute)->by("$name:m:user:$id");
            $limits[] = Limit::perHour($perHour)->by("$name:h:user:$id");
        }

        return $limits;
    }
}
