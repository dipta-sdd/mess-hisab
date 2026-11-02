<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\Auth\FrontendUrl;
use App\Services\Auth\GoogleAuthService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GoogleController extends Controller
{
    public function redirect(): RedirectResponse
    {
        abort_unless(config('auth.google_enabled'), 404);

        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request, GoogleAuthService $google): RedirectResponse
    {
        abort_unless(config('auth.google_enabled'), 404);

        try {
            $profile = Socialite::driver('google')->user();
            $user = $google->resolveUser($profile);

            Auth::guard('web')->login($user, true);
            if ($request->hasSession()) {
                $request->session()->regenerate();
            }
        } catch (Throwable $e) {
            report($e);

            return redirect()->away(FrontendUrl::to('auth/callback', ['status' => 'error']));
        }

        return redirect()->away(FrontendUrl::to('auth/callback', ['status' => 'ok']));
    }
}
