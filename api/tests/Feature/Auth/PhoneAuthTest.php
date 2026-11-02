<?php

use App\Http\Middleware\EnsurePhoneVerified;
use App\Models\PhoneOtp;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;

require_once __DIR__.'/AuthHelpers.php';

beforeEach(function () {
    $this->sms = cBootPhoneAuth();
});

function pLocked(array $attrs = []): User
{
    return user(['phone' => '01712345678', 'phone_verified_at' => null, ...$attrs]);
}

// --- the lock -------------------------------------------------------------------------------

it('locks unverified accounts out of gated routes with 403 phone_unverified', function () {
    Route::middleware(['api', 'auth:sanctum', EnsurePhoneVerified::class])->get('/api/_test/gated', fn () => ['ok' => true]);

    $this->actingAs(pLocked());
    $this->getJson('/api/_test/gated')->assertForbidden()->assertJsonPath('code', 'phone_unverified')->assertJsonStructure(['message', 'code']);

    $this->actingAs(user());
    $this->getJson('/api/_test/gated')->assertOk();

    // A Google-verified email counts as a verified contact.
    $this->actingAs(user(['phone' => null, 'phone_verified_at' => null, 'google_id' => 'g1', 'email_verified_at' => now()]));
    $this->getJson('/api/_test/gated')->assertOk();
});

it('still lets a locked account reach auth routes', function () {
    $this->actingAs(pLocked());

    $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.user.phone_verified', false);
});

// --- verify the signed-in user's phone --------------------------------------------------------

it('sends and verifies the signup code', function () {
    $user = pLocked();
    $this->actingAs($user);

    $res = $this->postJson('/api/auth/phone/send')->assertOk()->assertJsonStructure(['expires_at', 'resend_at']);
    expect(abs(now()->addMinutes(5)->diffInSeconds($res->json('expires_at'), false)))->toBeLessThan(5);
    $this->sms->assertSentTo('01712345678', 1);
    expect(PhoneOtp::first()->code_hash)->not->toBe($this->sms->lastCode('01712345678'));

    $res = $this->postJson('/api/auth/phone/verify', ['code' => $this->sms->lastCode('01712345678')])->assertOk();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data'))->toMatchArray(['phone_verified' => true, 'has_verified_contact' => true]);
    expect($user->fresh()->phone_verified_at)->not->toBeNull();
    expect(PhoneOtp::live()->count())->toBe(0);
});

it('answers 409 already_verified when the phone is verified', function () {
    $this->actingAs(user());

    $this->postJson('/api/auth/phone/send')->assertStatus(409)->assertJsonPath('code', 'already_verified');
    $this->postJson('/api/auth/phone/verify', ['code' => '123456'])->assertStatus(409);
    $this->sms->assertNothingSent();
});

it('rejects a second send within 60 seconds without texting again', function () {
    $this->actingAs(pLocked());
    $this->postJson('/api/auth/phone/send')->assertOk();

    $this->travel(20)->seconds();
    $res = $this->postJson('/api/auth/phone/send')->assertStatus(429)->assertJsonPath('code', 'otp_resend_wait');

    expect($res->json('retry_after'))->toBeBetween(39, 41);
    $this->sms->assertSentTo('01712345678', 1);
    expect(PhoneOtp::count())->toBe(1);
});

it('sends a fresh code after 60 seconds and the old one stops working', function () {
    $this->actingAs(pLocked());
    $this->postJson('/api/auth/phone/send')->assertOk();
    $first = $this->sms->lastCode('01712345678');

    $this->travel(61)->seconds();
    $this->postJson('/api/auth/phone/send')->assertOk();
    $second = $this->sms->lastCode('01712345678');

    $this->sms->assertSentTo('01712345678', 2);
    expect(PhoneOtp::count())->toBe(1);
    if ($first !== $second) {
        $this->postJson('/api/auth/phone/verify', ['code' => $first])->assertUnprocessable()->assertJsonPath('code', 'otp_invalid');
    }
    $this->postJson('/api/auth/phone/verify', ['code' => $second])->assertOk();
});

it('expires codes after 5 minutes', function () {
    $this->actingAs(pLocked());
    $this->postJson('/api/auth/phone/send')->assertOk();
    $code = $this->sms->lastCode('01712345678');

    $this->travel(6)->minutes();

    $this->postJson('/api/auth/phone/verify', ['code' => $code])
        ->assertUnprocessable()->assertJsonPath('code', 'otp_expired')->assertJsonValidationErrors(['code']);
});

it('consumes a code after 5 wrong tries', function () {
    $this->actingAs(pLocked());
    $this->postJson('/api/auth/phone/send')->assertOk();
    $right = $this->sms->lastCode('01712345678');
    $wrong = $right === '000000' ? '111111' : '000000';

    foreach (range(1, 4) as $i) {
        $this->postJson('/api/auth/phone/verify', ['code' => $wrong])->assertUnprocessable()->assertJsonPath('code', 'otp_invalid')->assertJsonValidationErrors(['code']);
    }
    $this->postJson('/api/auth/phone/verify', ['code' => $wrong])->assertUnprocessable()->assertJsonPath('code', 'otp_too_many');

    $this->travel(61)->seconds(); // past the verify throttle window
    $this->postJson('/api/auth/phone/verify', ['code' => $right])->assertUnprocessable()->assertJsonPath('code', 'otp_too_many');
    expect(User::first()->phone_verified_at)->toBeNull();
});

it('deletes the code and answers 502 sms_failed when the SMS cannot be sent', function () {
    $this->actingAs(pLocked());
    $this->sms->failNext();

    $this->postJson('/api/auth/phone/send')->assertStatus(502)->assertJsonPath('code', 'sms_failed');

    expect(PhoneOtp::count())->toBe(0);

    // No resend wait afterwards: the person can try again straight away.
    $this->sms->failNext(false);
    $this->postJson('/api/auth/phone/send')->assertOk();
});

it('validates the code format', function () {
    $this->actingAs(pLocked());

    $this->postJson('/api/auth/phone/verify', [])->assertUnprocessable()->assertJsonValidationErrors(['code']);
    $this->postJson('/api/auth/phone/verify', ['code' => 'abc'])->assertUnprocessable()->assertJsonValidationErrors(['code']);
});

it('requires auth for the verify endpoints', function () {
    $this->postJson('/api/auth/phone/send')->assertUnauthorized();
    $this->postJson('/api/auth/phone/verify', ['code' => '123456'])->assertUnauthorized();
    $this->postJson('/api/auth/me/phone', ['phone' => '01711111111'])->assertUnauthorized();
    $this->postJson('/api/auth/me/phone/verify', ['phone' => '01711111111', 'code' => '123456'])->assertUnauthorized();
});

it('throttles sends to 3 per minute', function () {
    foreach (['01711111111', '01722222222', '01733333333'] as $phone) {
        $this->postJson('/api/auth/password/phone', ['phone' => $phone])->assertStatus(202);
    }

    $this->postJson('/api/auth/password/phone', ['phone' => '01744444444'])->assertStatus(429)->assertJsonMissingPath('code');
});

it('texts in the locale of the user', function () {
    $this->actingAs(pLocked(['locale' => 'bn']));

    $this->postJson('/api/auth/phone/send')->assertOk();

    expect($this->sms->sentTo('01712345678')[0]['message'])->toContain('মেস হিসাব')->toMatch('/\d{6}/');
});

// --- forgot password by phone ---------------------------------------------------------------

it('resets the password by phone end to end', function () {
    $user = user(['phone' => '01712345678', 'password' => 'old-password']);
    $user->createToken('t');
    DB::table('sessions')->insert(['id' => 'old', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
    $oldRemember = $user->remember_token;

    $this->postJson('/api/auth/password/phone', ['phone' => '+8801712345678'])->assertStatus(202);
    $this->sms->assertSentTo('01712345678', 1);

    $token = $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])
        ->assertOk()->json('reset_token');
    expect($token)->toBeString()->not->toBeEmpty();

    $this->postJson('/api/auth/password/phone/reset', [
        'phone' => '01712345678', 'reset_token' => $token, 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertOk();

    $user->refresh();
    expect(Hash::check('brand-new-pass', $user->password))->toBeTrue()
        ->and($user->remember_token)->not->toBe($oldRemember)
        ->and($user->tokens()->count())->toBe(0)
        ->and(DB::table('sessions')->where('id', 'old')->exists())->toBeFalse();
    $this->postJson('/api/auth/login', ['login' => '01712345678', 'password' => 'brand-new-pass'])->assertOk();
});

it('makes the reset token single use', function () {
    user(['phone' => '01712345678']);
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678']);
    $token = $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])->json('reset_token');
    $body = ['phone' => '01712345678', 'reset_token' => $token, 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass'];

    $this->postJson('/api/auth/password/phone/reset', $body)->assertOk();
    $this->postJson('/api/auth/password/phone/reset', $body)->assertUnprocessable()->assertJsonValidationErrors(['reset_token']);
});

it('rejects a bogus reset token, or one used with another phone', function () {
    $victim = user(['phone' => '01822222222', 'password' => 'victim-pass']);
    user(['phone' => '01712345678']);
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678']);
    $token = $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])->json('reset_token');

    $this->postJson('/api/auth/password/phone/reset', [
        'phone' => '01822222222', 'reset_token' => $token, 'password' => 'hacked-pass-1', 'password_confirmation' => 'hacked-pass-1',
    ])->assertUnprocessable()->assertJsonValidationErrors(['reset_token']);
    $this->postJson('/api/auth/password/phone/reset', [
        'phone' => '01822222222', 'reset_token' => 'bogus', 'password' => 'hacked-pass-1', 'password_confirmation' => 'hacked-pass-1',
    ])->assertUnprocessable()->assertJsonValidationErrors(['reset_token']);
    expect(Hash::check('victim-pass', $victim->fresh()->password))->toBeTrue();
});

it('answers 202 for unknown phones and sends nothing', function () {
    $this->postJson('/api/auth/password/phone', ['phone' => '01999999999'])->assertStatus(202);

    $this->sms->assertNothingSent();
    expect(PhoneOtp::count())->toBe(0);
    $this->postJson('/api/auth/password/phone', ['phone' => 'nope'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
});

it('answers 202 even while the reset code is still on cooldown or the SMS fails', function () {
    user(['phone' => '01712345678']);
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678'])->assertStatus(202);
    $this->sms->assertSentTo('01712345678', 1);

    user(['phone' => '01811111111']);
    $this->sms->failNext();
    $this->postJson('/api/auth/password/phone', ['phone' => '01811111111'])->assertStatus(202);
});

it('refuses a wrong reset code and one for an unknown phone', function () {
    user(['phone' => '01712345678']);
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678']);

    $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => '000000'])
        ->assertStatus(422)->assertJsonValidationErrors(['code']);
    $this->postJson('/api/auth/password/phone/verify', ['phone' => '01999999999', 'code' => '000000'])
        ->assertStatus(422)->assertJsonValidationErrors(['code']);
});

it('lets the real owner of an unverified phone in through a reset', function () {
    $squatted = pLocked();
    $this->postJson('/api/auth/password/phone', ['phone' => '01712345678']);
    $token = $this->postJson('/api/auth/password/phone/verify', ['phone' => '01712345678', 'code' => $this->sms->lastCode('01712345678')])->json('reset_token');
    $this->postJson('/api/auth/password/phone/reset', [
        'phone' => '01712345678', 'reset_token' => $token, 'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
    ])->assertOk();

    expect($squatted->fresh()->phone_verified_at)->not->toBeNull();
});

it('keeps the email reset endpoints working', function () {
    $user = user(['email' => 'me@example.com']);

    $this->postJson('/api/auth/forgot-password', ['email' => 'me@example.com'])->assertStatus(202);
    $this->postJson('/api/auth/reset-password', [])->assertUnprocessable();
});

// --- phone change ---------------------------------------------------------------------------

it('keeps the old phone until the new one is verified', function () {
    $user = user(['phone' => '01712345678']);
    $this->actingAs($user);

    $this->postJson('/api/auth/me/phone', ['phone' => '+8801899999999'])->assertOk()->assertJsonStructure(['expires_at', 'resend_at']);

    $this->sms->assertSentTo('01899999999', 1);
    $this->sms->assertSentTo('01712345678', 0);
    expect($user->fresh())->phone->toBe('01712345678')->phone_verified_at->not->toBeNull();

    $res = $this->postJson('/api/auth/me/phone/verify', ['phone' => '01899999999', 'code' => $this->sms->lastCode('01899999999')])->assertOk();

    expectContractShape($res->json('data'), 'User');
    expect($res->json('data'))->toMatchArray(['phone' => '01899999999', 'phone_verified' => true]);
    expect($user->fresh()->phone)->toBe('01899999999');
});

it('does not change the phone on a wrong code', function () {
    $user = user(['phone' => '01712345678']);
    $this->actingAs($user);
    $this->postJson('/api/auth/me/phone', ['phone' => '01899999999'])->assertOk();

    $this->postJson('/api/auth/me/phone/verify', ['phone' => '01899999999', 'code' => '12345x'])->assertUnprocessable();
    $this->postJson('/api/auth/me/phone/verify', ['phone' => '01899999999', 'code' => $this->sms->lastCode('01899999999') === '000000' ? '111111' : '000000'])
        ->assertUnprocessable()->assertJsonPath('code', 'otp_invalid');
    expect($user->fresh()->phone)->toBe('01712345678');
});

it('rejects a phone that another account already has', function () {
    user(['phone' => '01899999999']);
    $this->actingAs(user(['phone' => '01712345678']));

    $this->postJson('/api/auth/me/phone', ['phone' => '01899999999'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $this->postJson('/api/auth/me/phone', ['phone' => '+880 1899-999999'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $this->postJson('/api/auth/me/phone', ['phone' => 'bad'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $this->sms->assertNothingSent();
});

it('rejects a number taken between the code and the confirmation', function () {
    $user = user(['phone' => '01712345678']);
    $this->actingAs($user);
    $this->postJson('/api/auth/me/phone', ['phone' => '01899999999'])->assertOk();
    user(['phone' => '01899999999']);

    $this->postJson('/api/auth/me/phone/verify', ['phone' => '01899999999', 'code' => $this->sms->lastCode('01899999999')])
        ->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    expect($user->fresh()->phone)->toBe('01712345678');
});

it('does not let another user use a change code meant for someone else', function () {
    $this->actingAs(user(['phone' => '01712345678']));
    $this->postJson('/api/auth/me/phone', ['phone' => '01899999999'])->assertOk();
    $code = $this->sms->lastCode('01899999999');

    $mallory = user(['phone' => '01611111111']);
    $this->actingAs($mallory);
    $this->postJson('/api/auth/me/phone/verify', ['phone' => '01899999999', 'code' => $code])->assertUnprocessable();
    expect($mallory->fresh()->phone)->toBe('01611111111');
});
