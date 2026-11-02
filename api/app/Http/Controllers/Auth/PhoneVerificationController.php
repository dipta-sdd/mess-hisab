<?php

namespace App\Http\Controllers\Auth;

use App\Enums\OtpPurpose;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePhoneRequest;
use App\Http\Requests\Auth\PhoneCodeForNumberRequest;
use App\Http\Requests\Auth\PhoneCodeRequest;
use App\Http\Resources\UserResource;
use App\Models\PhoneOtp;
use App\Models\User;
use App\Services\Auth\PhoneOtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** The signed-in user proving their phone: first verification and number change. */
class PhoneVerificationController extends Controller
{
    public function __construct(private PhoneOtpService $otps) {}

    public function send(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->requireUnverifiedPhone($user);

        return $this->issued($this->otps->send($user, $user->phone, OtpPurpose::Verify));
    }

    public function verify(PhoneCodeRequest $request): UserResource
    {
        $user = $request->user();
        $this->requireUnverifiedPhone($user);

        $this->otps->verify($user->phone, OtpPurpose::Verify, $request->validated('code'), $user->id);
        $user->forceFill(['phone_verified_at' => now()])->save();

        return new UserResource($user->fresh());
    }

    public function change(ChangePhoneRequest $request): JsonResponse
    {
        return $this->issued($this->otps->send($request->user(), $request->validated('phone'), OtpPurpose::Change));
    }

    public function confirmChange(PhoneCodeForNumberRequest $request): UserResource
    {
        $user = $request->user();
        $phone = $request->validated('phone');

        $this->otps->verify($phone, OtpPurpose::Change, $request->validated('code'), $user->id);

        // Someone may have taken the same number since the code was sent.
        if (User::where('phone', $phone)->where('id', '!=', $user->id)->exists()) {
            throw ValidationException::withMessages(['phone' => [trans('validation.unique', ['attribute' => 'phone'])]]);
        }
        $user->forceFill(['phone' => $phone, 'phone_verified_at' => now()])->save();

        return new UserResource($user->fresh());
    }

    private function requireUnverifiedPhone(User $user): void
    {
        if ($user->phone === null) {
            throw ValidationException::withMessages(['phone' => [__('otp.no_phone')]]);
        }
        if ($user->hasVerifiedPhone()) {
            abort(response()->json(['message' => __('otp.already_verified'), 'code' => 'already_verified'], 409));
        }
    }

    private function issued(PhoneOtp $otp): JsonResponse
    {
        return response()->json([
            'expires_at' => $otp->expires_at->toIso8601String(),
            'resend_at' => $otp->sent_at->copy()->addSeconds(PhoneOtpService::RESEND_SECONDS)->toIso8601String(),
        ]);
    }
}
