<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\User;
use App\Notifications\Auth\ResetPasswordNotification;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordController extends Controller
{
    /** Always 202, whether or not the email exists (no account enumeration). */
    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        // Only a proven address may recover an account (email verification is off, so in practice the
        // phone reset is the way in); an unproven one could belong to someone squatting the account.
        $email = strtolower(trim($request->validated('email')));
        if (! User::whereRaw('lower(email) = ?', [$email])->whereNotNull('email_verified_at')->exists()) {
            return response()->json(['message' => __('If that email has an account, a reset link is on its way.')], 202);
        }
        Password::broker()->sendResetLink(
            ['email' => $email],
            fn (User $user, string $token) => $user->notify(new ResetPasswordNotification($token)),
        );

        return response()->json(['message' => __('If that email has an account, a reset link is on its way.')], 202);
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::broker()->reset(
            [
                'email' => strtolower(trim($request->validated('email'))),
                'password' => $request->validated('password'),
                'password_confirmation' => $request->input('password_confirmation'),
                'token' => $request->validated('token'),
            ],
            function (User $user, string $password) {
                $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
                event(new PasswordReset($user));
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => [trans($status)]]);
        }

        return response()->json(['message' => trans($status)]);
    }
}
