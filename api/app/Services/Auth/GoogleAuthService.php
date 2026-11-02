<?php

namespace App\Services\Auth;

use App\Enums\Locale;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;

class GoogleAuthService
{
    /**
     * Find the user for a Google profile: by google_id, else link to an existing
     * account with the same email, else create a Google-only account.
     */
    public function resolveUser(SocialiteUser $google): User
    {
        $email = strtolower(trim((string) $google->getEmail()));
        if ($email === '') {
            throw new \RuntimeException('Google did not return an email address.');
        }
        // Only trust addresses Google itself has verified.
        $raw = method_exists($google, 'getRaw') ? $google->getRaw() : ($google->user ?? []);
        if (array_key_exists('email_verified', (array) $raw) && ! filter_var($raw['email_verified'], FILTER_VALIDATE_BOOL)) {
            throw new \RuntimeException('Google email is not verified.');
        }
        $googleId = (string) $google->getId();

        $user = User::where('google_id', $googleId)->first();
        if ($user) {
            return $user;
        }

        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        if ($user && $user->email_verified_at === null && $user->hasVerifiedPhone()) {
            // The account belongs to whoever proved the phone; the unproven address is all the Google
            // owner can claim, so it moves to a new Google account instead of taking this one over.
            $user->forceFill(['email' => null])->save();
            $user = null;
        }
        if ($user) {
            $user->forceFill(['google_id' => $googleId]);
            if ($user->email_verified_at === null) {
                // The address was never proven by whoever registered it, so the
                // Google owner takes the account over: drop the unproven password
                // and every existing session/token (pre-account hijacking).
                $user->forceFill([
                    'email_verified_at' => now(),
                    'password' => null,
                    'remember_token' => Str::random(60),
                ]);
                $user->tokens()->delete();
                DB::table('sessions')->where('user_id', $user->id)->delete();
            }
            $user->save();

            return $user;
        }

        $user = new User([
            'name' => $google->getName() ?: Str::before($email, '@'),
            'email' => $email,
            'locale' => Locale::En->value,
        ]);
        $user->forceFill(['google_id' => $googleId, 'email_verified_at' => now()]);
        $user->save();

        return $user;
    }
}
