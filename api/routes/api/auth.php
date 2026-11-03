<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\GoogleController;
use App\Http\Controllers\Auth\PasswordController;
use App\Http\Controllers\Auth\PhoneResetController;
use App\Http\Controllers\Auth\PhoneVerificationController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

Route::prefix('auth')->group(function () {
    // "guest" in CONTRACT = no auth needed (not Laravel's `guest` middleware, which would redirect).
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('forgot-password', [PasswordController::class, 'forgot'])->middleware('throttle:6,1');
    Route::post('reset-password', [PasswordController::class, 'reset'])->middleware('throttle:6,1');

    // Forgot password by SMS. The first step always answers 202 (no account enumeration).
    Route::post('password/phone', [PhoneResetController::class, 'forgot'])->middleware('throttle:otp-send');
    Route::post('password/phone/verify', [PhoneResetController::class, 'verify'])->middleware('throttle:otp-verify');
    Route::post('password/phone/reset', [PhoneResetController::class, 'reset'])->middleware('throttle:6,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('me', [AuthController::class, 'me']);
        Route::patch('me', [AuthController::class, 'update']);
        Route::patch('me/password', [AuthController::class, 'changePassword'])->middleware('throttle:6,1');
        Route::patch('me/email', [AuthController::class, 'changeEmail'])->middleware('throttle:6,1');

        Route::post('phone/send', [PhoneVerificationController::class, 'send'])->middleware('throttle:otp-send');
        Route::post('phone/verify', [PhoneVerificationController::class, 'verify'])->middleware('throttle:otp-verify');
        Route::post('me/phone', [PhoneVerificationController::class, 'change'])->middleware('throttle:otp-send');
        Route::post('me/phone/verify', [PhoneVerificationController::class, 'confirmChange'])->middleware('throttle:otp-verify');
    });

    // 404 unless config('auth.google_enabled') (checked in GoogleController).
    // Browser redirects need a real session (Socialite state + login), whatever the Referer is.
    Route::middleware('web')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->group(function () {
        Route::get('google/redirect', [GoogleController::class, 'redirect']);
        Route::get('google/callback', [GoogleController::class, 'callback']);
    });
});
