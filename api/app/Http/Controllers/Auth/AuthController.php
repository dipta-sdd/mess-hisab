<?php

namespace App\Http\Controllers\Auth;

use App\Enums\Locale;
use App\Enums\OtpPurpose;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\UpdateMeRequest;
use App\Http\Resources\MembershipResource;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Rules\BdMobile;
use App\Services\Auth\OtpException;
use App\Services\Auth\PhoneOtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function register(RegisterRequest $request, PhoneOtpService $otps): JsonResponse
    {
        $data = $request->validated();

        $user = User::create([
            'name' => $data['name'],
            'phone' => $data['phone'],
            'email' => $data['email'] ?? null,
            'password' => $data['password'],
            'locale' => $data['locale'] ?? Locale::En->value,
        ]);

        $this->startSession($request, $user);

        try {
            $otps->send($user, $user->phone, OtpPurpose::Verify);
        } catch (OtpException) {
            // The account exists; the verify screen asks again through auth/phone/send.
        }

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function login(LoginRequest $request): UserResource
    {
        $login = trim($request->validated('login'));
        $credentials = str_contains($login, '@')
            ? ['email' => strtolower($login)]
            : ['phone' => BdMobile::normalize($login)];
        $credentials['password'] = $request->validated('password');

        if (! Auth::guard('web')->attempt($credentials, (bool) $request->boolean('remember'))) {
            throw ValidationException::withMessages(['login' => [trans('auth.failed')]]);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return new UserResource($request->user('web'));
    }

    public function logout(Request $request): Response
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $memberships = $user->memberships()->with('mess')->orderBy('id')->get();

        return response()->json(['data' => [
            'user' => (new UserResource($user))->resolve($request),
            'memberships' => MembershipResource::collection($memberships)->resolve($request),
        ]]);
    }

    public function update(UpdateMeRequest $request): UserResource
    {
        $user = $request->user();
        $user->fill($request->validated())->save();

        return new UserResource($user->fresh());
    }

    private function startSession(RegisterRequest $request, User $user): void
    {
        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }
    }
}
