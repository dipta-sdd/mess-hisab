<?php

use App\Models\MessMember;
use App\Models\User;

// A Referer in SANCTUM_STATEFUL_DOMAINS makes Sanctum start a session, like the real SPA.
function cSpaHeaders(): array
{
    return ['Referer' => 'http://localhost:3000/'];
}

it('registers a user, logs them in and returns the User shape', function () {
    $res = $this->withHeaders(cSpaHeaders())->postJson('/api/auth/register', [
        'name' => 'Shuvendu', 'email' => 'Shuvendu@Example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass', 'locale' => 'bn',
    ])->assertCreated();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data'))->toMatchArray(['name' => 'Shuvendu', 'email' => 'shuvendu@example.com', 'locale' => 'bn', 'has_password' => true, 'has_google' => false]);
    $this->assertAuthenticated('web');
    expect(User::count())->toBe(1);
});

it('defaults the locale to en on register', function () {
    $this->postJson('/api/auth/register', [
        'name' => 'A', 'email' => 'a@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertCreated()->assertJsonPath('data.locale', 'en');
});

it('validates registration', function () {
    user(['email' => 'taken@example.com']);

    $this->postJson('/api/auth/register', [])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email', 'password']);
    $this->postJson('/api/auth/register', [
        'name' => 'A', 'email' => 'taken@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    $this->postJson('/api/auth/register', [
        'name' => 'A', 'email' => 'new@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'different',
    ])->assertUnprocessable()->assertJsonValidationErrors(['password']);
    $this->postJson('/api/auth/register', [
        'name' => 'A', 'email' => 'new@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass', 'locale' => 'fr',
    ])->assertUnprocessable()->assertJsonValidationErrors(['locale']);
});

it('logs in with valid credentials', function () {
    $user = user(['email' => 'me@example.com', 'password' => 'secret-pass']);

    $res = $this->withHeaders(cSpaHeaders())->postJson('/api/auth/login', ['email' => 'ME@example.com', 'password' => 'secret-pass', 'remember' => true])->assertOk();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data.id'))->toBe($user->id);
    $this->assertAuthenticatedAs($user, 'web');
});

it('rejects bad credentials with 422', function () {
    user(['email' => 'me@example.com', 'password' => 'secret-pass']);

    $this->postJson('/api/auth/login', ['email' => 'me@example.com', 'password' => 'wrong'])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    $this->postJson('/api/auth/login', ['email' => 'nobody@example.com', 'password' => 'x'])->assertUnprocessable()->assertJsonValidationErrors(['email']);
    $this->postJson('/api/auth/login', [])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
    $this->assertGuest('web');
});

it('does not let a Google-only account log in with a password', function () {
    user(['email' => 'g@example.com', 'password' => null, 'google_id' => 'gid-1']);

    $this->postJson('/api/auth/login', ['email' => 'g@example.com', 'password' => ''])->assertUnprocessable();
    $this->postJson('/api/auth/login', ['email' => 'g@example.com', 'password' => 'anything'])->assertUnprocessable();
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
