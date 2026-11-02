<?php

namespace App\Http\Controllers\Auth;

use App\Enums\OtpPurpose;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\PhoneCodeForNumberRequest;
use App\Http\Requests\Auth\PhoneNumberRequest;
use App\Http\Requests\Auth\ResetPhonePasswordRequest;
use App\Models\User;
use App\Services\Auth\OtpException;
use App\Services\Auth\PhoneOtpService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Forgot-password by SMS: send code, swap the code for a one-time reset token, set the password. */
class PhoneResetController extends Controller
{
    private const TOKEN_MINUTES = 15;

    public function __construct(private PhoneOtpService $otps) {}

    /** Always 202, whether or not the number has an account (no account enumeration). */
    public function forgot(PhoneNumberRequest $request): JsonResponse
    {
        $user = User::where('phone', $request->validated('phone'))->first();
        if ($user && $this->phoneMayReset($user)) {
            try {
                $this->otps->send($user, $user->phone, OtpPurpose::Reset);
            } catch (OtpException) {
                // Wait/failure details would reveal that the account exists.
            }
        }

        return response()->json(['message' => __('otp.reset_sent')], 202);
    }

    public function verify(PhoneCodeForNumberRequest $request): JsonResponse
    {
        $phone = $request->validated('phone');
        $this->otps->verify($phone, OtpPurpose::Reset, $request->validated('code'));

        $token = Str::random(48);
        Cache::put($this->cacheKey($token), $phone, now()->addMinutes(self::TOKEN_MINUTES));

        return response()->json(['reset_token' => $token]);
    }

    public function reset(ResetPhonePasswordRequest $request): JsonResponse
    {
        $phone = $request->validated('phone');

        // pull() = single use, even when the phone does not match.
        $user = Cache::pull($this->cacheKey($request->validated('reset_token'))) === $phone
            ? User::where('phone', $phone)->first()
            : null;
        if (! $user || ! $this->phoneMayReset($user)) {
            throw ValidationException::withMessages(['reset_token' => [__('otp.reset_token_invalid')]]);
        }

        // Receiving the code proves the number is theirs. When that claims an account whose phone was
        // never proven, an unproven email on it may be the squatter's: drop it so it can't win it back.
        if ($user->phone_verified_at === null && $user->email_verified_at === null) {
            $user->forceFill(['email' => null]);
        }
        $user->forceFill([
            'password' => $request->validated('password'),
            'remember_token' => Str::random(60),
            'phone_verified_at' => $user->phone_verified_at ?? now(),
        ])->save();
        $user->tokens()->delete();
        DB::table('sessions')->where('user_id', $user->id)->delete();
        event(new PasswordReset($user));

        return response()->json(['message' => __('otp.password_reset')]);
    }

    /**
     * An unproven phone can't claim an account that already belongs to a proven email or a Google
     * login: whoever typed that number at signup may not be the account's owner.
     */
    private function phoneMayReset(User $user): bool
    {
        return $user->phone_verified_at !== null || ($user->email_verified_at === null && $user->google_id === null);
    }

    /** Only a hash of the token is kept server-side. */
    private function cacheKey(string $token): string
    {
        return 'phone-reset:'.hash('sha256', $token);
    }
}
