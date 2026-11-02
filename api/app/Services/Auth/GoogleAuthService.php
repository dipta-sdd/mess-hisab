<?php

namespace App\Services\Auth;

use App\Enums\Locale;
use App\Models\User;
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
        $googleId = (string) $google->getId();

        $user = User::where('google_id', $googleId)->first();
        if ($user) {
            return $user;
        }

        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        if ($user) {
            $user->forceFill(['google_id' => $googleId]);
            if ($user->email_verified_at === null) {
                $user->forceFill(['email_verified_at' => now()]);
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
