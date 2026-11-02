<?php

namespace App\Services\Auth;

use App\Enums\OtpPurpose;
use App\Models\PhoneOtp;
use App\Models\User;
use App\Rules\BdMobile;
use App\Services\Sms\SmsFailed;
use App\Services\Sms\SmsSender;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/** Issues and checks the 6-digit SMS codes in `phone_otps` (only a hash is stored). */
class PhoneOtpService
{
    public const TTL_MINUTES = 5;

    public const RESEND_SECONDS = 60;

    public const MAX_ATTEMPTS = 5;

    /** Per number and purpose, across codes (IP throttles alone don't stop a spread-out attacker). */
    public const MAX_SENDS_PER_HOUR = 5;

    public const MAX_FAILS_PER_HOUR = 10;

    public function __construct(private SmsSender $sms) {}

    /**
     * Send a fresh code. Throws resend-wait while the last one is under 60 s old; once it is older
     * a new code replaces it (so the person can actually get another text).
     *
     * @throws OtpException
     */
    public function send(?User $user, string $phone, OtpPurpose $purpose): PhoneOtp
    {
        $phone = BdMobile::normalize($phone);

        $live = PhoneOtp::live()->where('phone', $phone)->where('purpose', $purpose->value)->latest('id')->first();
        if ($live?->sent_at) {
            $wait = self::RESEND_SECONDS - (int) $live->sent_at->diffInSeconds(now(), true);
            if ($wait > 0) {
                throw OtpException::resendWait($wait);
            }
        }

        $sendKey = "otp-sends:{$purpose->value}:{$phone}";
        if (RateLimiter::tooManyAttempts($sendKey, self::MAX_SENDS_PER_HOUR)) {
            throw OtpException::resendWait(RateLimiter::availableIn($sendKey));
        }
        RateLimiter::hit($sendKey, 3600);

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        PhoneOtp::where('phone', $phone)->where('purpose', $purpose->value)->delete();
        $otp = PhoneOtp::create([
            'user_id' => $user?->id,
            'phone' => $phone,
            'purpose' => $purpose,
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'sent_at' => now(),
        ]);

        try {
            $this->sms->send($phone, __('otp.sms', ['code' => $code, 'minutes' => self::TTL_MINUTES], $user?->locale ?: app()->getLocale()));
        } catch (SmsFailed $e) {
            $otp->delete();
            Log::warning('SMS send failed: '.$e->getMessage());
            throw OtpException::smsFailed();
        }

        return $otp;
    }

    /**
     * Check a code and consume it. `$userId` ties the code to the account that asked for it.
     *
     * @throws OtpException
     */
    public function verify(string $phone, OtpPurpose $purpose, string $code, ?int $userId = null): PhoneOtp
    {
        $phone = BdMobile::normalize($phone);

        // Per number and IP: strangers' wrong guesses can't lock the owner out, and each code still dies
        // after MAX_ATTEMPTS, so guesses per number stay capped by MAX_SENDS_PER_HOUR codes an hour.
        $failKey = "otp-fails:{$purpose->value}:{$phone}:".request()->ip();
        if (RateLimiter::tooManyAttempts($failKey, self::MAX_FAILS_PER_HOUR)) {
            throw OtpException::tooMany();
        }

        $otp = PhoneOtp::where('phone', $phone)->where('purpose', $purpose->value)
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->latest('id')->first();

        if (! $otp) {
            throw OtpException::expired();
        }
        if ($otp->consumed_at) {
            throw $otp->attempts >= self::MAX_ATTEMPTS ? OtpException::tooMany() : OtpException::expired();
        }
        if ($otp->expires_at->isPast()) {
            $otp->delete();
            throw OtpException::expired();
        }

        if (! Hash::check($code, $otp->code_hash)) {
            // Atomic bump so parallel guesses can't dodge the cap.
            PhoneOtp::whereKey($otp->id)->increment('attempts');
            RateLimiter::hit($failKey, 3600);
            $otp->refresh();
            if ($otp->attempts >= self::MAX_ATTEMPTS) {
                $otp->forceFill(['consumed_at' => now()])->save();
                throw OtpException::tooMany();
            }
            throw OtpException::invalid();
        }

        // Consume only if still unconsumed (one winner when two requests race).
        if (PhoneOtp::whereKey($otp->id)->whereNull('consumed_at')->update(['consumed_at' => now()]) === 0) {
            throw OtpException::expired();
        }

        return $otp->refresh();
    }
}
