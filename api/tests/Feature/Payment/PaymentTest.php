<?php

use App\Models\AuditLog;
use App\Models\LedgerEntry;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Payment;

function gpOpenMonth($mess, array $attrs = []): Month
{
    return Month::factory()->create(['mess_id' => $mess->id] + $attrs);
}

function gpValidPayment(MessMember $member, array $over = []): array
{
    return ['member_id' => $member->id, 'group' => 'meals', 'amount_paisa' => 50000, 'paid_on' => '2026-11-10'] + $over;
}

it('lets the manager record a payment received by the current manager', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = gpOpenMonth($mess);
    $payer = MessMember::factory()->for($mess)->create();

    $res = $this->postJson(messPath($mess, 'payments'), gpValidPayment($payer, ['note' => 'cash']))->assertCreated();

    expectContractShape($res->json('data'), 'Payment');
    expect($res->json('data'))->toMatchArray([
        'month_id' => $month->id, 'member_id' => $payer->id, 'group' => 'meals', 'amount_paisa' => 50000,
        'paid_on' => '2026-11-10', 'note' => 'cash', 'received_by_member_id' => $me->id,
    ]);
    expect(LedgerEntry::forMess($mess->id)->count())->toBe(0);
    expect(AuditLog::where('event', 'payment.created')->where('mess_id', $mess->id)->count())->toBe(1);
});

it('records payments for archived members', function () {
    [$mess] = actingAsMember('manager');
    gpOpenMonth($mess);
    $gone = MessMember::factory()->for($mess)->archived()->create();

    $this->postJson(messPath($mess, 'payments'), gpValidPayment($gone, ['group' => 'fixed']))->assertCreated();
});

it('lists payments for any member with filters', function () {
    [$mess, $me] = actingAsMember('member');
    $month = gpOpenMonth($mess);
    $other = MessMember::factory()->for($mess)->create();
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $me->id, 'received_by_member_id' => $mess->manager_member_id]);
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $other->id, 'received_by_member_id' => $mess->manager_member_id]);
    $foreign = otherMess();
    Payment::factory()->create(['mess_id' => $foreign->id]);

    $all = $this->getJson(messPath($mess, 'payments'))->assertOk();
    expect($all->json('data'))->toHaveCount(2);
    foreach ($all->json('data') as $row) {
        expectContractShape($row, 'Payment');
    }

    $mine = $this->getJson(messPath($mess, "payments?member_id={$me->id}&month_id={$month->id}"))->assertOk();
    expect($mine->json('data'))->toHaveCount(1)->and($mine->json('data.0.member_id'))->toBe($me->id);

    expect($this->getJson(messPath($mess, 'payments?month_id='.($month->id + 999)))->json('data'))->toBe([]);
});

it('validates the payload', function (array $bad, string $field) {
    [$mess] = actingAsMember('manager');
    gpOpenMonth($mess);
    $payer = MessMember::factory()->for($mess)->create();

    $this->postJson(messPath($mess, 'payments'), array_merge(gpValidPayment($payer), $bad))
        ->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'zero amount' => [['amount_paisa' => 0], 'amount_paisa'],
    'negative amount' => [['amount_paisa' => -5], 'amount_paisa'],
    'float amount' => [['amount_paisa' => 10.5], 'amount_paisa'],
    'string amount' => [['amount_paisa' => '10.5'], 'amount_paisa'],
    'bad group' => [['group' => 'deposit'], 'group'],
    'bad date' => [['paid_on' => '10/11/2026'], 'paid_on'],
    'missing member' => [['member_id' => null], 'member_id'],
    'unknown member' => [['member_id' => 99999999], 'member_id'],
    'date with no month' => [['paid_on' => '2020-01-01'], 'paid_on'],
]);

it('rejects another mess member with 422', function () {
    [$mess] = actingAsMember('manager');
    gpOpenMonth($mess);
    $foreignMember = MessMember::forMess(otherMess()->id)->first();

    $this->postJson(messPath($mess, 'payments'), gpValidPayment($foreignMember))
        ->assertUnprocessable()->assertJsonValidationErrors(['member_id']);
});

it('refuses payments in a closed month with 409', function () {
    [$mess] = actingAsMember('manager');
    Month::factory()->closed()->create(['mess_id' => $mess->id]);
    $payer = MessMember::factory()->for($mess)->create();

    $this->postJson(messPath($mess, 'payments'), gpValidPayment($payer))
        ->assertStatus(409)->assertJson(['code' => 'month_closed']);
    expect(Payment::forMess($mess->id)->count())->toBe(0);
});

it('lets a plain member and the admin-only role not write', function (string $role) {
    [$mess] = actingAsMember($role);
    gpOpenMonth($mess);
    $payer = MessMember::factory()->for($mess)->create();
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'member_id' => $payer->id, 'month_id' => Month::first()->id]);

    $this->postJson(messPath($mess, 'payments'), gpValidPayment($payer))->assertForbidden();
    $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['amount_paisa' => 1])->assertForbidden();
    $this->deleteJson(messPath($mess, "payments/{$payment->id}"))->assertForbidden();
})->with(['member', 'admin']);

it('blocks archived managers from writing', function () {
    [$mess] = actingAsMember('archived');
    $this->postJson(messPath($mess, 'payments'), [])->assertForbidden();
});

it('updates a payment and audits it', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = gpOpenMonth($mess);
    $payer = MessMember::factory()->for($mess)->create();
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $payer->id, 'received_by_member_id' => $me->id]);

    $res = $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['amount_paisa' => 70000, 'group' => 'meals', 'note' => 'fixed typo'])->assertOk();

    expectContractShape($res->json('data'), 'Payment');
    expect($res->json('data'))->toMatchArray(['amount_paisa' => 70000, 'group' => 'meals', 'note' => 'fixed typo', 'received_by_member_id' => $me->id]);
    expect(AuditLog::where('event', 'payment.updated')->count())->toBe(1);
});

it('validates updates', function () {
    [$mess] = actingAsMember('manager');
    $month = gpOpenMonth($mess);
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id]);

    $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['amount_paisa' => 0])->assertUnprocessable()->assertJsonValidationErrors(['amount_paisa']);
    $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['paid_on' => '2020-01-01'])->assertUnprocessable()->assertJsonValidationErrors(['paid_on']);
});

it('refuses to edit or delete a payment of a closed month', function () {
    [$mess] = actingAsMember('manager');
    $month = Month::factory()->closed()->create(['mess_id' => $mess->id]);
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id]);

    $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['amount_paisa' => 1])->assertStatus(409)->assertJson(['code' => 'month_closed']);
    $this->deleteJson(messPath($mess, "payments/{$payment->id}"))->assertStatus(409)->assertJson(['code' => 'month_closed']);
    expect($payment->fresh()->amount_paisa)->toBe(100000);
});

it('refuses moving a payment into a closed month', function () {
    [$mess] = actingAsMember('manager');
    $open = gpOpenMonth($mess, ['starts_on' => '2026-11-01', 'ends_on' => '2026-11-30']);
    Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $open->id]);

    $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['paid_on' => '2026-10-20'])->assertStatus(409)->assertJson(['code' => 'month_closed']);
});

it('moves a payment to the month of its new date', function () {
    [$mess] = actingAsMember('manager');
    $a = gpOpenMonth($mess, ['starts_on' => '2026-11-01', 'ends_on' => '2026-11-30']);
    $b = gpOpenMonth($mess, ['starts_on' => '2026-12-01', 'ends_on' => '2026-12-31']);
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $a->id]);

    $this->patchJson(messPath($mess, "payments/{$payment->id}"), ['paid_on' => '2026-12-02'])->assertOk()->assertJsonPath('data.month_id', $b->id);
});

it('deletes a payment (soft) and audits it', function () {
    [$mess] = actingAsMember('manager');
    $month = gpOpenMonth($mess);
    $payment = Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id]);

    $this->deleteJson(messPath($mess, "payments/{$payment->id}"))->assertNoContent();

    expect(Payment::forMess($mess->id)->count())->toBe(0)
        ->and(Payment::forMess($mess->id)->withTrashed()->count())->toBe(1)
        ->and(AuditLog::where('event', 'payment.deleted')->count())->toBe(1);
});

it('hides other mess data with 404', function () {
    [$mess] = actingAsMember('manager');
    gpOpenMonth($mess);
    $foreign = otherMess();
    $foreignPayment = Payment::factory()->create(['mess_id' => $foreign->id]);

    $this->getJson(messPath($foreign, 'payments'))->assertNotFound();
    $this->postJson(messPath($foreign, 'payments'), [])->assertNotFound();
    $this->patchJson(messPath($mess, "payments/{$foreignPayment->id}"), ['amount_paisa' => 5])->assertNotFound();
    $this->deleteJson(messPath($mess, "payments/{$foreignPayment->id}"))->assertNotFound();
    $this->patchJson(messPath($foreign, "payments/{$foreignPayment->id}"), ['amount_paisa' => 5])->assertNotFound();
});

it('requires authentication', function () {
    $this->getJson(messPath(otherMess(), 'payments'))->assertUnauthorized();
});
