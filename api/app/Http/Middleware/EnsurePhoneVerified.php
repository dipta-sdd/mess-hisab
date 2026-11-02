<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Locks accounts without a verified phone (or Google-verified email) out of mess routes. */
class EnsurePhoneVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->hasVerifiedContact()) {
            return response()->json([
                'message' => __('otp.phone_unverified'),
                'code' => 'phone_unverified',
            ], 403);
        }

        return $next($request);
    }
}
