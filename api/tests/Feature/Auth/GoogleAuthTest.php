<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;

function cMockGoogle(?SocialiteUser $profile = null, ?Throwable $throws = null): void
{
    $provider = Mockery::mock(Provider::class);
    if ($throws) {
        $provider->shouldReceive('user')->andThrow($throws);
    } else {
        $provider->shouldReceive('user')->andReturn($profile);
    }
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
}

function cGoogleProfile(array $attrs = []): SocialiteUser
{
    return (new SocialiteUser)->map(array_merge(['id' => 'g-123', 'name' => 'Gee Oh', 'email' => 'gee@example.com'], $attrs));
}

beforeEach(fn () => config(['auth.google_enabled' => true]));

it('answers 404 on every Google route while disabled', function () {
    config(['auth.google_enabled' => false]);

    $this->get('/api/auth/google/redirect')->assertNotFound();
    $this->get('/api/auth/google/callback')->assertNotFound();
    $this->assertGuest('web');
});

it('redirects to Google', function () {
    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('redirect')->once()->andReturn(redirect()->away('https://accounts.google.com/o/oauth2/auth?x=1'));
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->get('/api/auth/google/redirect')->assertRedirect('https://accounts.google.com/o/oauth2/auth?x=1');
});

it('creates a Google-only user on first sign-in and logs them in', function () {
    cMockGoogle(cGoogleProfile());

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=ok');

    $user = User::where('email', 'gee@example.com')->first();
    expect($user)->not->toBeNull()
        ->and($user->password)->toBeNull()
        ->and($user->google_id)->toBe('g-123')
        ->and($user->name)->toBe('Gee Oh')
        ->and($user->locale)->toBe('en');
    $this->assertAuthenticatedAs($user, 'web');
});

it('links Google to an existing verified account and keeps its password', function () {
    $existing = user(['email' => 'gee@example.com', 'name' => 'Original', 'email_verified_at' => now()]);
    cMockGoogle(cGoogleProfile(['email' => 'Gee@Example.com']));

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=ok');

    expect(User::count())->toBe(1);
    $existing->refresh();
    expect($existing->google_id)->toBe('g-123')->and($existing->name)->toBe('Original')->and($existing->password)->not->toBeNull();
    $this->assertAuthenticatedAs($existing, 'web');
});

it('signs a returning Google user in by google id', function () {
    $user = user(['email' => 'old@example.com', 'google_id' => 'g-123']);
    cMockGoogle(cGoogleProfile(['email' => 'changed@example.com']));

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=ok');

    expect(User::count())->toBe(1);
    $this->assertAuthenticatedAs($user, 'web');
});

it('redirects with status=error when Google fails', function () {
    cMockGoogle(throws: new RuntimeException('invalid state'));

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=error');

    expect(User::count())->toBe(0);
    $this->assertGuest('web');
});

it('redirects with status=error when Google gives no email', function () {
    cMockGoogle(cGoogleProfile(['email' => null]));

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=error');

    expect(User::count())->toBe(0);
    $this->assertGuest('web');
});

it('takes over an unverified same-email account, dropping its password and sessions', function () {
    $squatter = user(['email' => 'gee@example.com', 'email_verified_at' => null, 'phone_verified_at' => null]);
    $squatter->createToken('t');
    DB::table('sessions')->insert(['id' => 'sq', 'user_id' => $squatter->id, 'payload' => '', 'last_activity' => time()]);
    cMockGoogle(cGoogleProfile());

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=ok');

    $squatter->refresh();
    expect($squatter->password)->toBeNull()
        ->and($squatter->email_verified_at)->not->toBeNull()
        ->and($squatter->tokens()->count())->toBe(0)
        ->and(DB::table('sessions')->where('id', 'sq')->exists())->toBeFalse();
});

it('refuses a Google profile whose email is not verified', function () {
    $existing = user(['email' => 'gee@example.com']);
    cMockGoogle(cGoogleProfile()->setRaw(['email_verified' => false]));

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=error');

    expect($existing->refresh()->google_id)->toBeNull();
    $this->assertGuest('web');
});
