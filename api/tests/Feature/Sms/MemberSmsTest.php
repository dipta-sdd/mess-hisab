<?php

use App\Models\MessMember;
use App\Models\Payment;
use App\Models\User;
use App\Services\Balance\MonthBalanceService;
use App\Services\Sms\FakeSender;
use App\Services\Sms\SmsSender;

require_once __DIR__.'/../Lifecycle/LifecycleHelpers.php';

function msFake(): FakeSender
{
    $fake = new FakeSender;
    app()->instance(SmsSender::class, $fake);

    return $fake;
}

function msPayer(array $userState = []): array
{
    $user = User::factory()->create($userState);

    return [MessMember::factory()->create(['mess_id' => test()->mess->id, 'user_id' => $user->id]), $user];
}

function msPost($member, array $over = [])
{
    return test()->postJson(messPath(test()->mess, 'payments'), [
        'member_id' => $member->id, 'group' => 'meals', 'amount_paisa' => 500000, 'paid_on' => '2026-11-12',
    ] + $over);
}

beforeEach(function () {
    [$this->mess] = actingAsMember('manager');
    gpOpenMonth($this->mess);
    $this->fake = msFake();
});

it('texts a verified member when a payment is recorded', function () {
    [$member, $user] = msPayer();
    msPost($member)->assertCreated();

    expect($this->fake->sentTo($user->phone))->toHaveCount(1);
    expect($this->fake->sent[0]['message'])->toBe('Tk 5,000 payment received on 12 Nov. Thank you.');
});

it('does not text unverified, phoneless, placeholder or archived members', function () {
    [$unverified] = msPayer(['phone_verified_at' => null]);
    $noPhone = MessMember::factory()->create(['mess_id' => $this->mess->id, 'user_id' => User::factory()->withoutPhone()->create()->id]);
    $placeholder = MessMember::factory()->placeholder()->create(['mess_id' => $this->mess->id]);
    $archived = MessMember::factory()->archived()->create(['mess_id' => $this->mess->id]);

    foreach ([$unverified, $noPhone, $placeholder, $archived] as $m) {
        msPost($m)->assertCreated();
    }

    $this->fake->assertNothingSent();
});

it('still saves the payment when the gateway fails', function () {
    [$member] = msPayer();
    $this->fake->failNext();

    msPost($member)->assertCreated();
    expect(Payment::where('member_id', $member->id)->count())->toBe(1);
});

it('texts a change for amount or date, nothing for a note, and cancel plus new for a new member', function () {
    [$a, $ua] = msPayer();
    [$b, $ub] = msPayer();
    $id = msPost($a)->json('data.id');
    $url = messPath($this->mess, "payments/$id");
    $this->fake->sent = [];

    $this->patchJson($url, ['note' => 'x'])->assertOk();
    $this->fake->assertNothingSent();

    $this->patchJson($url, ['amount_paisa' => 450000])->assertOk();
    expect($this->fake->sent[0]['message'])->toBe('Your 12 Nov payment was changed to Tk 4,500.');

    $this->patchJson($url, ['paid_on' => '2026-11-14'])->assertOk();
    expect($this->fake->sent[1]['message'])->toBe('Your 12 Nov payment was changed to Tk 4,500 on 14 Nov.');

    $this->fake->sent = [];
    $this->patchJson($url, ['member_id' => $b->id])->assertOk();
    expect($this->fake->sentTo($ua->phone)[0]['message'])->toBe('Your Tk 4,500 payment of 14 Nov was cancelled.');
    expect($this->fake->sentTo($ub->phone)[0]['message'])->toBe('Tk 4,500 payment received on 14 Nov. Thank you.');
});

it('texts a cancellation when a payment is deleted', function () {
    [$member, $user] = msPayer();
    $id = msPost($member)->json('data.id');
    $this->fake->sent = [];

    $this->deleteJson(messPath($this->mess, "payments/$id"))->assertNoContent();

    expect($this->fake->sentTo($user->phone)[0]['message'])->toBe('Your Tk 5,000 payment of 12 Nov was cancelled.');
});

it('keeps every message ASCII, one segment and with a single amount', function () {
    foreach (['payment_received', 'payment_changed', 'payment_changed_date', 'payment_cancelled', 'month_owes', 'month_credit', 'month_settled'] as $key) {
        $text = __('sms.'.$key, ['amount' => 'Tk 99,999.99', 'date' => '31 Dec', 'old_date' => '30 Dec', 'month' => 'September'], 'en');
        expect($text)->toMatch('/^[\x20-\x7E]+$/')
            ->and(strlen($text))->toBeLessThanOrEqual(160)
            ->and(substr_count($text, 'Tk'))->toBeLessThanOrEqual(1);
    }
});

it('texts every active verified member when a month closes, and nothing on reopen', function () {
    [$mess, $me, $month, $ids] = kScenario();
    $fake = msFake();
    $expected = collect($ids)->filter(function ($id) {
        $u = MessMember::find($id)->user;

        return $u && $u->hasVerifiedPhone();
    })->count();

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertOk();

    expect($fake->sent)->toHaveCount($expected);
    $totals = app(MonthBalanceService::class)->snapshot($month->refresh())->totals();
    foreach ($ids as $id) {
        $user = MessMember::find($id)->user;
        if (! $user || ! $user->hasVerifiedPhone()) {
            expect($fake->sentTo($user?->phone ?? ''))->toBeEmpty();

            continue;
        }
        $balance = $totals[$id] ?? 0;
        $message = $fake->sentTo($user->phone)[0]['message'];
        match (true) {
            $balance < 0 => expect($message)->toMatch('/^November closed\. You need to pay Tk [\d,.]+\.$/'),
            $balance > 0 => expect($message)->toMatch('/^November closed\. You will get back Tk [\d,.]+\.$/'),
            default => expect($message)->toBe('November closed. Nothing to pay or receive.'),
        };
    }

    $fake->sent = [];
    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/reopen")->assertOk();
    $fake->assertNothingSent();
});

it('still closes the month when the sender throws something unexpected', function () {
    [$mess, $me, $month] = kScenario();
    app()->instance(SmsSender::class, new class implements SmsSender
    {
        public function send(string $phone, string $message): void
        {
            throw new RuntimeException('boom');
        }
    });

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertOk();
});

it('texts an archived member at close only when they still have a balance', function () {
    [$mess, $me, $month, $ids] = kScenario();
    $fake = msFake();
    $totals = app(MonthBalanceService::class)->snapshot($month)->totals();
    $withBalance = collect($ids)->first(fn ($id) => $id !== $me->id && ($totals[$id] ?? 0) !== 0 && MessMember::find($id)->user?->hasVerifiedPhone());
    expect($withBalance)->not->toBeNull();
    $member = MessMember::find($withBalance);
    $member->forceFill(['archived_at' => now()])->save();

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertOk();

    expect($fake->sentTo($member->user->phone))->toHaveCount(1);
});
