<?php

use App\Models\MessMember;

function lSpa(): array
{
    return ['Referer' => 'http://localhost:3000/'];
}

it('shows Bangla field errors to a bn user', function () {
    [$mess] = actingAsMember('manager');
    test()->actingAs(auth()->user()->forceFill(['locale' => 'bn']));
    auth()->user()->save();

    $res = $this->postJson(messPath($mess, 'payments'), [])->assertUnprocessable();

    expect($res->json('errors.amount_paisa.0'))->toBe('টাকার পরিমাণ দিতে হবে।');
    expect($res->json('errors.member_id.0'))->toContain('সদস্য');
});

it('keeps English field errors for an en user', function () {
    [$mess] = actingAsMember('manager');

    $res = $this->postJson(messPath($mess, 'payments'), [])->assertUnprocessable();

    expect($res->json('errors.amount_paisa.0'))->toBe('The amount paisa field is required.');
});

it('resolves the user locale for SPA cookie auth (after the session starts)', function () {
    user(['email' => 'b@example.com', 'password' => 'secret-pass', 'locale' => 'bn']);

    $this->withHeaders(lSpa())->postJson('/api/auth/login', ['email' => 'b@example.com', 'password' => 'secret-pass'])->assertOk();
    // The login request itself was a guest request; the next one carries the session cookie.
    $res = $this->withHeaders(lSpa() + ['Accept-Language' => 'en'])->patchJson('/api/auth/me', ['locale' => 'fr'])->assertUnprocessable();

    expect($res->json('errors.locale.0'))->toContain('ভাষা');
});

it('translates custom 403 and 409 messages and keeps their codes', function () {
    [$mess] = actingAsMember('member');
    auth()->user()->forceFill(['locale' => 'bn'])->save();

    $this->postJson(messPath($mess, 'payments'), [])
        ->assertForbidden()
        ->assertJsonPath('message', 'আপনার ভূমিকা দিয়ে এটা করা যাবে না।');

});

it('gives a Bangla login error to a guest with the NEXT_LOCALE cookie', function () {
    user(['email' => 'g@example.com', 'password' => 'secret-pass']);

    $res = $this->withCredentials()->withUnencryptedCookie('NEXT_LOCALE', 'bn')
        ->postJson('/api/auth/login', ['email' => 'g@example.com', 'password' => 'wrong-pass'])
        ->assertUnprocessable();

    expect($res->json('errors.email.0'))->toBe('ইমেইল বা পাসওয়ার্ড মিলছে না।');
});

it('falls back to Accept-Language bn, then to English', function () {
    user(['email' => 'g@example.com', 'password' => 'secret-pass']);
    $bad = ['email' => 'g@example.com', 'password' => 'wrong-pass'];

    expect($this->postJson('/api/auth/login', $bad)->json('errors.email.0'))
        ->toBe('These credentials do not match our records.');
    expect($this->postJson('/api/auth/login', $bad, ['Accept-Language' => 'bn-BD,bn;q=0.9'])->json('errors.email.0'))
        ->toBe('ইমেইল বা পাসওয়ার্ড মিলছে না।');
    expect($this->withCredentials()->withUnencryptedCookie('NEXT_LOCALE', 'fr')->postJson('/api/auth/login', $bad)->json('errors.email.0'))
        ->toBe('These credentials do not match our records.');
});

it('prefers the user locale over the cookie', function () {
    user(['email' => 'u@example.com', 'password' => 'secret-pass', 'locale' => 'en']);
    $res = $this->withCredentials()->withUnencryptedCookie('NEXT_LOCALE', 'bn')
        ->withHeaders(['Accept-Language' => 'bn'])
        ->postJson('/api/auth/login', ['email' => 'u@example.com', 'password' => 'secret-pass'])->assertOk();
    expect($res->json('data.locale'))->toBe('en');
});

it('reads a plain NEXT_LOCALE cookie on stateful (encrypted-cookie) SPA requests too', function () {
    user(['email' => 'g@example.com', 'password' => 'secret-pass']);

    $res = $this->withHeaders(lSpa())->withCredentials()->withUnencryptedCookie('NEXT_LOCALE', 'bn')
        ->postJson('/api/auth/login', ['email' => 'g@example.com', 'password' => 'wrong-pass'])->assertUnprocessable();

    expect($res->json('errors.email.0'))->toBe('ইমেইল বা পাসওয়ার্ড মিলছে না।');
});

it('translates the 409 message but not its code', function () {
    [$mess] = actingAsMember('manager');
    auth()->user()->forceFill(['locale' => 'bn'])->save();
    $mess->update(['meal_tracking' => 'off']);

    $res = $this->putJson(messPath($mess, 'meals'), [])->assertStatus(409);

    expect($res->json('code'))->toBe('meal_tracking_off');
    expect($res->json('message'))->toBe('এই মেসে মিলের হিসাব বন্ধ আছে।');
});
