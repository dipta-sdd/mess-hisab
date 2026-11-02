<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\GoogleController;
use App\Http\Controllers\Auth\PasswordController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

Route::prefix('auth')->group(function () {
    // "guest" in CONTRACT = no auth needed (not Laravel's `guest` middleware, which would redirect).
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('forgot-password', [PasswordController::class, 'forgot'])->middleware('throttle:6,1');
    Route::post('reset-password', [PasswordController::class, 'reset'])->middleware('throttle:6,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('me', [AuthController::class, 'me']);
        Route::patch('me', [AuthController::class, 'update']);
    });

    // Browser redirects need a real session (Socialite state + login), whatever the Referer is.
    Route::middleware('web')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->group(function () {
        Route::get('google/redirect', [GoogleController::class, 'redirect']);
        Route::get('google/callback', [GoogleController::class, 'callback']);
    });
});
