<?php

use App\Services\Sms\BulkSmsBdSender;
use App\Services\Sms\FakeSender;
use App\Services\Sms\LogSender;
use App\Services\Sms\SmsFailed;
use App\Services\Sms\SmsSender;
use App\Services\Sms\SmsServiceProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config(['services.bulksmsbd' => ['api_key' => 'SECRET-KEY-123', 'sender_id' => 'MessHisab', 'url' => 'https://sms.test/api/smsapi']]);
});

it('sends to BulkSMSBD and treats response_code 202 as success', function () {
    Http::fake(['sms.test/*' => Http::response(['response_code' => 202, 'success_message' => 'SMS Submitted Successfully'], 200)]);

    (new BulkSmsBdSender)->send('01712345678', 'Your code is 123456');

    Http::assertSent(fn (Request $r) => $r->url() === 'https://sms.test/api/smsapi'
        && $r['api_key'] === 'SECRET-KEY-123'
        && $r['type'] === 'text'
        && $r['number'] === '8801712345678'
        && $r['senderid'] === 'MessHisab'
        && $r['message'] === 'Your code is 123456');
});

it('uses the unicode type for Bangla text', function () {
    Http::fake(['sms.test/*' => Http::response(['response_code' => 202], 200)]);

    (new BulkSmsBdSender)->send('01712345678', 'আপনার কোড 123456');

    Http::assertSent(fn (Request $r) => $r['type'] === 'unicode');
});

it('fails on HTTP 200 with an error response_code', function () {
    Http::fake(['sms.test/*' => Http::response(['response_code' => 1007, 'error_message' => 'Balance Insufficient'], 200)]);

    expect(fn () => (new BulkSmsBdSender)->send('01712345678', 'x'))->toThrow(SmsFailed::class);
});

it('fails on a body without a response_code', function () {
    Http::fake(['sms.test/*' => Http::response('<html>oops</html>', 200)]);

    expect(fn () => (new BulkSmsBdSender)->send('01712345678', 'x'))->toThrow(SmsFailed::class);
});

it('fails on HTTP 500 even with a 202 body', function () {
    Http::fake(['sms.test/*' => Http::response(['response_code' => 202], 500)]);

    expect(fn () => (new BulkSmsBdSender)->send('01712345678', 'x'))->toThrow(SmsFailed::class);
});

it('fails when the gateway cannot be reached, without leaking the key', function () {
    Http::fake(fn () => throw new Illuminate\Http\Client\ConnectionException('cURL error for https://sms.test/api/smsapi?api_key=SECRET-KEY-123'));

    try {
        (new BulkSmsBdSender)->send('01712345678', 'x');
        $this->fail('Expected SmsFailed');
    } catch (SmsFailed $e) {
        expect($e->getMessage())->not->toContain('SECRET-KEY-123');
    }
});

it('never puts the key in the failure message', function () {
    Http::fake(['sms.test/*' => Http::response(['response_code' => 1007, 'error_message' => 'bad key SECRET-KEY-123'], 200)]);

    try {
        (new BulkSmsBdSender)->send('01712345678', 'x');
        $this->fail('Expected SmsFailed');
    } catch (SmsFailed $e) {
        expect($e->getMessage())->not->toContain('SECRET-KEY-123');
    }
});

it('refuses to send when not configured', function () {
    config(['services.bulksmsbd.api_key' => null]);
    Http::fake();

    expect(fn () => (new BulkSmsBdSender)->send('01712345678', 'x'))->toThrow(SmsFailed::class);
    Http::assertNothingSent();
});

it('binds the sender by services.sms.driver', function () {
    config(['services.sms.driver' => 'bulksmsbd']);
    (new SmsServiceProvider(app()))->register();
    expect(app(SmsSender::class))->toBeInstanceOf(BulkSmsBdSender::class);

    app()->forgetInstance(SmsSender::class);
    config(['services.sms.driver' => 'log']);
    (new SmsServiceProvider(app()))->register();
    expect(app(SmsSender::class))->toBeInstanceOf(LogSender::class);
});

it('records sends in the fake sender', function () {
    $fake = new FakeSender;
    $fake->send('01712345678', 'Your code is 654321.');

    $fake->assertSentTo('01712345678');
    expect($fake->lastCode('01712345678'))->toBe('654321')->and($fake->lastCode('01800000000'))->toBeNull();
});
