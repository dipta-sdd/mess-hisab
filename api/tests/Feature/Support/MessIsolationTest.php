<?php

use App\Models\MessMember;
use App\Models\Payment;
use Illuminate\Support\Facades\Route;

/*
| Lead-owned guard for the pattern every mess endpoint relies on:
| `mess` middleware resolves before route-model binding, so a child id
| from another mess is a 404, and non-members get 404 too.
*/

beforeEach(function () {
    Route::middleware(['api', 'auth:sanctum', 'mess'])
        ->get('/api/messes/{mess}/_probe/payments/{payment}', fn (App\Models\Mess $mess, Payment $payment) => ['id' => $payment->id]);
    Route::middleware(['api', 'auth:sanctum', 'mess', 'mess.role:manager'])
        ->post('/api/messes/{mess}/_probe/manager-only', fn () => ['ok' => true]);
});

it('binds a child model of the same mess', function () {
    [$mess, $me] = actingAsMember();
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'member_id' => $me->id]);

    $this->getJson(messPath($mess, "_probe/payments/{$payment->id}"))->assertOk()->assertJson(['id' => $payment->id]);
});

it('returns 404 for a child id that belongs to another mess', function () {
    [$mess] = actingAsMember();
    $other = otherMess();
    $foreign = Payment::factory()->create(['mess_id' => $other->id, 'member_id' => MessMember::forMess($other->id)->first()->id]);

    $this->getJson(messPath($mess, "_probe/payments/{$foreign->id}"))->assertNotFound();
});

it('returns 404 when the user is not a member of the mess', function () {
    actingAsMember();
    $other = otherMess();

    $this->getJson(messPath($other, '_probe/payments/1'))->assertNotFound();
});

it('returns 401 for guests', function () {
    $other = otherMess();

    $this->getJson(messPath($other, '_probe/payments/1'))->assertUnauthorized();
});

it('enforces mess.role', function () {
    [$mess] = actingAsMember('member');
    $this->postJson(messPath($mess, '_probe/manager-only'))->assertForbidden();

    [$mess2] = actingAsMember('manager');
    $this->postJson(messPath($mess2, '_probe/manager-only'))->assertOk();
});

it('makes archived members read-only', function () {
    [$mess, $me] = actingAsMember('archived');
    $mess->update(['manager_member_id' => $me->id]); // even an archived manager cannot write

    $this->postJson(messPath($mess, '_probe/manager-only'))->assertForbidden();
});

it('fills mess_id and writes an audit row on create inside a mess context', function () {
    [$mess, $me] = actingAsMember();
    app(App\Support\MessContext::class)->set($mess, $me);

    $payment = Payment::factory()->create(['mess_id' => null, 'member_id' => $me->id, 'month_id' => App\Models\Month::factory()->create(['mess_id' => $mess->id])->id]);

    expect($payment->mess_id)->toBe($mess->id)
        ->and(App\Models\AuditLog::where('event', 'payment.created')->where('subject_id', $payment->id)->exists())->toBeTrue();
});
