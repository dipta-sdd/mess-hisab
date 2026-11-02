<?php

use App\Models\User;
use App\Notifications\Auth\ResetPasswordNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

it('sends a reset link pointing at the frontend', function () {
    Notification::fake();
    $user = user(['email' => 'me+tag@example.com']);

    $this->postJson('/api/auth/forgot-password', ['email' => 'me+tag@example.com'])->assertStatus(202);

    Notification::assertSentTo($user, ResetPasswordNotification::class, function (ResetPasswordNotification $n) use ($user) {
        $url = $n->url($user);
        parse_str(parse_url($url, PHP_URL_QUERY), $q);

        return str_starts_with($url, 'http://localhost:3000/reset-password?')
            && $q['email'] === 'me+tag@example.com'
            && $q['token'] === $n->token
            && str_contains($url, 'email=me%2Btag%40example.com');
    });
});

it('answers 202 for unknown emails without sending anything', function () {
    Notification::fake();

    $this->postJson('/api/auth/forgot-password', ['email' => 'ghost@example.com'])->assertStatus(202);

    Notification::assertNothingSent();
});

it('validates forgot-password', function () {
    $this->postJson('/api/auth/forgot-password', [])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    $this->postJson('/api/auth/forgot-password', ['email' => 'nope'])->assertUnprocessable()->assertJsonValidationErrors(['email']);
});

it('resets the password with a valid token', function () {
    $user = user(['email' => 'me@example.com']);
    $token = Password::broker()->createToken($user);

    $this->postJson('/api/auth/reset-password', [
        'token' => $token, 'email' => 'me@example.com', 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertOk();

    expect(Hash::check('brand-new-pass', $user->fresh()->password))->toBeTrue();
    // The token is single-use.
    $this->postJson('/api/auth/reset-password', [
        'token' => $token, 'email' => 'me@example.com', 'password' => 'another-pass-1', 'password_confirmation' => 'another-pass-1',
    ])->assertUnprocessable();
});

it('rejects a wrong token and invalid input', function () {
    $user = user(['email' => 'me@example.com']);
    $old = $user->password;

    $this->postJson('/api/auth/reset-password', [
        'token' => 'bogus', 'email' => 'me@example.com', 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    expect(User::find($user->id)->password)->toBe($old);

    $this->postJson('/api/auth/reset-password', [])->assertUnprocessable()->assertJsonValidationErrors(['token', 'email', 'password']);
    $this->postJson('/api/auth/reset-password', [
        'token' => 'x', 'email' => 'me@example.com', 'password' => 'short', 'password_confirmation' => 'short',
    ])->assertUnprocessable()->assertJsonValidationErrors(['password']);
});

it('lets a Google-only account set a password through reset', function () {
    $user = user(['email' => 'g@example.com', 'password' => null, 'google_id' => 'gid']);
    $token = Password::broker()->createToken($user);

    $this->postJson('/api/auth/reset-password', [
        'token' => $token, 'email' => 'g@example.com', 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertOk();

    expect(Hash::check('brand-new-pass', $user->fresh()->password))->toBeTrue();
});
