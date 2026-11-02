<?php

use App\Models\User;
use App\Notifications\Auth\ResetPasswordNotification;
use Illuminate\Support\Facades\Notification;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;

require_once __DIR__.'/AuthHelpers.php';

beforeEach(function () {
    $this->sms = cBootPhoneAuth();
});

it('locks an unverified member out of real mess routes, mess creation and invite accept', function () {
    [$mess, $me] = actingAsMember();
    $me->user->forceFill(['phone_verified_at' => null])->save();
    $this->actingAs($me->user->fresh());

    $this->getJson(messPath($mess))->assertForbidden()->assertJsonPath('code', 'phone_unverified');
    $this->getJson(messPath($mess, 'dashboard'))->assertForbidden()->assertJsonPath('code', 'phone_unverified');
    $this->postJson('/api/messes', ['name' => 'X'])->assertForbidden()->assertJsonPath('code', 'phone_unverified');
    $this->postJson('/api/invites/some-token/accept')->assertForbidden()->assertJsonPath('code', 'phone_unverified');

    $me->user->forceFill(['phone_verified_at' => now()])->save();
    $this->actingAs($me->user->fresh());
    $this->getJson(messPath($mess))->assertOk();
});

it('caps wrong codes per number across fresh codes', function () {
    user(['phone' => '01712345678', 'phone_verified_at' => null, 'email_verified_at' => null]);

    // Two rounds of five wrong tries on two different codes (waiting out the IP limits between).
    foreach ([1, 2] as $round) {
        $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
        foreach (range(1, 5) as $_) {
            $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => '000000']);
            $this->travel(13)->seconds();
        }
        $this->travel(1)->minutes();
    }

    // A third code is sent, but even the right one is refused for the rest of the hour.
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
    $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])
        ->assertUnprocessable()->assertJsonPath('code', 'otp_too_many');
});

it('caps texts per number per hour', function () {
    user(['phone' => '01712345678']);

    foreach (range(1, 7) as $_) {
        $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
        $this->travel(61)->seconds();
    }

    $this->sms->assertSentTo('01712345678', 5);
});

it('sends no email reset link to an unproven address', function () {
    Notification::fake();
    user(['email' => 'squat@example.com', 'email_verified_at' => null]);

    $this->postJson('/api/auth/forgot-password', ['email' => 'squat@example.com'])->assertStatus(202);

    Notification::assertNotSentTo(User::where('email', 'squat@example.com')->first(), ResetPasswordNotification::class);
});

it('drops an unproven email when a phone reset claims a squatted account', function () {
    $squatted = user(['phone' => '01712345678', 'phone_verified_at' => null, 'email' => 'squat@example.com', 'email_verified_at' => null]);
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678']);
    $token = $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])->json('reset_token');
    $this->postJson('/api/auth/password/phone/reset', [
        'phone' => '01712345678', 'reset_token' => $token, 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertOk();

    expect($squatted->fresh()->email)->toBeNull()->and($squatted->fresh()->phone_verified_at)->not->toBeNull();
});

it('gives Google a new account instead of one whose phone someone else proved', function () {
    config(['auth.google_enabled' => true]);
    $phoneOwner = user(['email' => 'gee@example.com', 'email_verified_at' => null]); // factory phone is verified
    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('user')->andReturn((new SocialiteUser)->map(['id' => 'g-123', 'name' => 'Gee', 'email' => 'gee@example.com']));
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=ok');

    $phoneOwner->refresh();
    expect($phoneOwner->google_id)->toBeNull()->and($phoneOwner->email)->toBeNull()->and($phoneOwner->password)->not->toBeNull();
    $google = User::where('google_id', 'g-123')->first();
    expect($google->id)->not->toBe($phoneOwner->id)->and($google->email)->toBe('gee@example.com');
    $this->assertAuthenticatedAs($google, 'web');
});

it('does not let a stranger lock the owner out with wrong codes', function () {
    user(['phone' => '01712345678']);
    foreach ([1, 2] as $_) {
        $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
        foreach (range(1, 5) as $_) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.66'])
                ->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => '000000']);
            $this->travel(13)->seconds();
        }
        $this->travel(1)->minutes();
    }

    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
        ->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])
        ->assertOk()->assertJsonStructure(['reset_token']);
});

it('drops an unproven phone when Google takes over a squatted account', function () {
    config(['auth.google_enabled' => true]);
    $squatted = user(['email' => 'gee@example.com', 'email_verified_at' => null, 'phone' => '01712345678', 'phone_verified_at' => null]);
    $provider = Mockery::mock(Provider::class);
    $provider->shouldReceive('user')->andReturn((new SocialiteUser)->map(['id' => 'g-123', 'name' => 'Gee', 'email' => 'gee@example.com']));
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

    $this->get('/api/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback?status=ok');

    expect($squatted->fresh()->google_id)->toBe('g-123')->and($squatted->fresh()->phone)->toBeNull();
});

it('lets no unproven phone reset an account a proven email owns', function () {
    $owned = user(['phone' => '01712345678', 'phone_verified_at' => null, 'email' => 'real@example.com', 'email_verified_at' => now()]);

    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
    $this->sms->assertSentTo('01712345678', 0);

    // Even with a code from before the email was proven, the reset is refused.
    $owned->forceFill(['email_verified_at' => null])->save();
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678']);
    $token = $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])->json('reset_token');
    $owned->forceFill(['email_verified_at' => now()])->save();
    $this->postJson('/api/auth/password/phone/reset', [
        'phone' => '01712345678', 'reset_token' => $token, 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertUnprocessable()->assertJsonValidationErrors('reset_token');
});
