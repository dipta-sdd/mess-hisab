<?php

use App\Models\MessMember;
use App\Models\User;

require_once __DIR__.'/AuthHelpers.php';

// A Referer in SANCTUM_STATEFUL_DOMAINS makes Sanctum start a session, like the real SPA.
function cSpaHeaders(): array
{
    return ['Referer' => 'http://localhost:3000/'];
}

beforeEach(function () {
    $this->sms = cBootPhoneAuth();
});

it('registers a user, logs them in, sends a verify code and returns the User shape', function () {
    $res = $this->withHeaders(cSpaHeaders())->postJson('/api/auth/register', [
        'name' => 'Shuvendu', 'phone' => '01712345678', 'email' => 'Shuvendu@Example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass', 'locale' => 'bn',
    ])->assertCreated();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data'))->toMatchArray([
        'name' => 'Shuvendu', 'phone' => '01712345678', 'phone_verified' => false, 'has_verified_contact' => false,
        'email' => 'shuvendu@example.com', 'locale' => 'bn', 'has_password' => true, 'has_google' => false,
    ]);
    $this->assertAuthenticated('web');
    expect(User::count())->toBe(1);
    $this->sms->assertSentTo('01712345678', 1);
});

it('registers without an email and normalizes +880 phones', function () {
    $res = $this->postJson('/api/auth/register', [
        'name' => 'A', 'phone' => '+880 1712-345678', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertCreated()->assertJsonPath('data.locale', 'en')->assertJsonPath('data.email', null);

    expect($res->json('data.phone'))->toBe('01712345678');
    $this->sms->assertSentTo('01712345678');
});

it('validates registration', function () {
    user(['email' => 'taken@example.com', 'phone' => '01811111111']);
    $ok = ['name' => 'A', 'phone' => '01722222222', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass'];

    $this->postJson('/api/auth/register', [])->assertUnprocessable()->assertJsonValidationErrors(['name', 'phone', 'password']);
    $this->postJson('/api/auth/register', [...$ok, 'phone' => '01811111111'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $this->postJson('/api/auth/register', [...$ok, 'phone' => '+8801811111111'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $this->postJson('/api/auth/register', [...$ok, 'phone' => '12345'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $this->postJson('/api/auth/register', [...$ok, 'email' => 'taken@example.com'])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    $this->postJson('/api/auth/register', [...$ok, 'password_confirmation' => 'different'])->assertUnprocessable()->assertJsonValidationErrors(['password']);
    $this->postJson('/api/auth/register', [...$ok, 'locale' => 'fr'])->assertUnprocessable()->assertJsonValidationErrors(['locale']);
    expect(User::count())->toBe(1);
    $this->sms->assertNothingSent();
});

it('still creates the account when the first SMS fails', function () {
    $this->sms->failNext();

    $this->postJson('/api/auth/register', [
        'name' => 'A', 'phone' => '01712345678', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertCreated();

    expect(User::count())->toBe(1);
});

it('logs in with a phone in any accepted form', function (string $typed) {
    $user = user(['phone' => '01712345678', 'password' => 'secret-pass']);

    $res = $this->withHeaders(cSpaHeaders())->postJson('/api/auth/login', ['login' => $typed, 'password' => 'secret-pass', 'remember' => true])->assertOk();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data.id'))->toBe($user->id);
    $this->assertAuthenticatedAs($user, 'web');
})->with(['01712345678', '+8801712345678', '8801712345678', '017 1234 5678', '1712345678']);

it('logs in with an email', function () {
    $user = user(['email' => 'me@example.com', 'password' => 'secret-pass']);

    $this->withHeaders(cSpaHeaders())->postJson('/api/auth/login', ['login' => 'ME@example.com', 'password' => 'secret-pass'])->assertOk();

    $this->assertAuthenticatedAs($user, 'web');
});

it('lets a locked account log in normally', function () {
    $user = user(['phone' => '01712345678', 'password' => 'secret-pass', 'phone_verified_at' => null]);

    $this->postJson('/api/auth/login', ['login' => '01712345678', 'password' => 'secret-pass'])
        ->assertOk()->assertJsonPath('data.has_verified_contact', false);
});

it('rejects bad credentials with 422 on login', function () {
    user(['phone' => '01712345678', 'email' => 'me@example.com', 'password' => 'secret-pass']);

    $this->postJson('/api/auth/login', ['login' => '01712345678', 'password' => 'wrong'])->assertUnprocessable()->assertJsonValidationErrors(['login']);
    $this->postJson('/api/auth/login', ['login' => 'me@example.com', 'password' => 'wrong'])->assertUnprocessable()->assertJsonValidationErrors(['login']);
    $this->postJson('/api/auth/login', ['login' => '01999999999', 'password' => 'x'])->assertUnprocessable()->assertJsonValidationErrors(['login']);
    $this->postJson('/api/auth/login', [])->assertUnprocessable()->assertJsonValidationErrors(['login', 'password']);
    $this->assertGuest('web');
});

it('does not let a Google-only account log in with a password', function () {
    user(['email' => 'g@example.com', 'password' => null, 'google_id' => 'gid-1']);

    $this->postJson('/api/auth/login', ['login' => 'g@example.com', 'password' => ''])->assertUnprocessable();
    $this->postJson('/api/auth/login', ['login' => 'g@example.com', 'password' => 'anything'])->assertUnprocessable();
});

it('logs out with 204', function () {
    $this->actingAs(user());

    $this->withHeaders(cSpaHeaders())->postJson('/api/auth/logout')->assertNoContent();
    $this->assertGuest('web');
});

it('requires auth for logout, me and patch me', function () {
    $this->postJson('/api/auth/logout')->assertUnauthorized();
    $this->getJson('/api/auth/me')->assertUnauthorized();
    $this->patchJson('/api/auth/me', ['name' => 'x'])->assertUnauthorized();
});

it('returns the user and memberships on me', function () {
    [$mess, $me] = actingAsMember('admin');
    $other = otherMess();
    MessMember::factory()->for($other)->create(['user_id' => $me->user_id]);
    MessMember::factory()->for($mess)->create(); // someone else's membership must not leak

    $res = $this->getJson('/api/auth/me')->assertOk();

    expectContractShape($res->json('data.user'), 'User');
    expect($res->json('data.memberships'))->toHaveCount(2);
    foreach ($res->json('data.memberships') as $membership) {
        expectContractShape($membership, 'Membership');
    }
    $mine = collect($res->json('data.memberships'))->firstWhere('mess_id', $mess->id);
    expect($mine)->toMatchArray(['member_id' => $me->id, 'mess_name' => $mess->name, 'is_admin' => true, 'is_manager' => false, 'archived' => false]);
});

it('flags archived memberships on me', function () {
    [$mess, $me] = actingAsMember('archived');

    $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.memberships.0.archived', true);
});

it('updates name and locale', function () {
    $user = user(['locale' => 'en']);
    $this->actingAs($user);

    $res = $this->patchJson('/api/auth/me', ['name' => 'New Name', 'locale' => 'bn'])->assertOk();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data'))->toMatchArray(['name' => 'New Name', 'locale' => 'bn']);
    expect($user->fresh()->locale)->toBe('bn');
});

it('validates patch me and ignores email changes', function () {
    $user = user(['email' => 'keep@example.com']);
    $this->actingAs($user);

    $this->patchJson('/api/auth/me', ['locale' => 'xx'])->assertUnprocessable()->assertJsonValidationErrors(['locale']);
    $this->patchJson('/api/auth/me', ['name' => ''])->assertUnprocessable()->assertJsonValidationErrors(['name']);
    $this->patchJson('/api/auth/me', ['email' => 'hacker@example.com', 'name' => 'Ok'])->assertOk();
    expect($user->fresh()->email)->toBe('keep@example.com');
});
