<?php

use App\Models\MessMember;

require_once __DIR__.'/BalanceHelpers.php';

afterEach(fn () => $this->travelBack());

/** A mess with a normal member ($me) plus two others; returns [mess, me, month, ids, other]. */
function mvSetup(string $role = 'member'): array
{
    [$mess, $me, $month, $ids] = jSetup($role);
    $other = MessMember::forMess($mess->id)->where('id', '!=', $me->id)->orderBy('id')->first();
    jToday('2026-11-15');

    return [$mess, $me, $month, $ids, $other];
}

it('shows a normal member only their own dashboard row and hides the manager balance', function () {
    [$mess, $me, $month] = mvSetup();
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk()->json('data');

    expect($d['members'])->toHaveCount(1)
        ->and($d['members'][0]['member_id'])->toBe($me->id)
        ->and($d['manager_balance_paisa'])->toBeNull()
        ->and($d['totals']['fixed_bills_paisa'])->toBe(90000)
        ->and($d)->toHaveKey('cash_pool_paisa');
});

it('keeps the full dashboard for staff', function () {
    [$mess, , $month] = mvSetup('manager');
    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk()->json('data');
    expect($d['members'])->toHaveCount(3)->and($d['manager_balance_paisa'])->not->toBeNull();
});

it('lets a normal member read only their own statement and history', function () {
    [$mess, $me, $month, , $other] = mvSetup();

    $this->getJson(messPath($mess, "statements/{$me->id}?month_id={$month->id}"))->assertOk();
    $this->getJson(messPath($mess, "statements/{$me->id}/history"))->assertOk();
    $this->getJson(messPath($mess, "statements/{$other->id}?month_id={$month->id}"))->assertForbidden();
    $this->getJson(messPath($mess, "statements/{$other->id}/history"))->assertForbidden();

    $foreign = otherMess();
    $this->getJson(messPath($foreign, "statements/{$me->id}"))->assertNotFound();
});

it('lets staff read any statement and history', function () {
    [$mess, , $month, , $other] = mvSetup('manager');
    $this->getJson(messPath($mess, "statements/{$other->id}?month_id={$month->id}"))->assertOk();
    $this->getJson(messPath($mess, "statements/{$other->id}/history"))->assertOk();
});

it('lets a normal member see approved expenses and their own paid ones, but not others\' unapproved ones', function () {
    [$mess, $me, $month, , $other] = mvSetup();
    $cat = jCategory($mess);
    jExpense($mess, $month, $cat, 1000, $me->id);
    jExpense($mess, $month, $cat, 2000, $other->id)->update(['created_by_member_id' => $me->id]);
    jExpense($mess, $month, $cat, 3000, $me->id)->update(['created_by_member_id' => $other->id]);
    jExpense($mess, $month, $cat, 4000, $other->id)->update(['status' => 'pending']);

    $res = $this->getJson(messPath($mess, 'expenses'))->assertOk();
    expect(collect($res->json('data'))->pluck('amount_paisa')->sort()->values()->all())->toBe([1000, 2000, 3000])
        ->and($res->json('meta.total'))->toBe(3);

    $this->actingAs($mess->manager->user);
    expect($this->getJson(messPath($mess, 'expenses'))->json('data'))->toHaveCount(4);
});

it('lists only a normal member\'s own meals, but all for staff', function () {
    [$mess, $me, $month, , $other] = mvSetup();
    jMeals($mess, $month, $me->id, 200);
    jMeals($mess, $month, $other->id, 300);

    $data = $this->getJson(messPath($mess, "meals?month_id={$month->id}"))->assertOk()->json('data');
    expect($data['entries'])->toHaveCount(1)->and($data['entries'][0]['member_id'])->toBe($me->id)
        ->and(array_keys($data['totals']))->toBe([$me->id]);

    $this->actingAs($mess->manager->user);
    $data = $this->getJson(messPath($mess, "meals?month_id={$month->id}"))->json('data');
    expect($data['entries'])->toHaveCount(2)->and($data['totals'])->toHaveCount(3);
});

it('lets a normal member see every member\'s payments and filter by one; cash stays open', function () {
    [$mess, $me, $month, , $other] = mvSetup();
    jPay($mess, $month, $me->id, 'meals', 1000);
    jPay($mess, $month, $other->id, 'meals', 2000);

    $res = $this->getJson(messPath($mess, 'payments'))->assertOk();
    expect($res->json('data'))->toHaveCount(2);
    expect($this->getJson(messPath($mess, "payments?member_id={$other->id}"))->json('data'))->toHaveCount(1);
    $this->getJson(messPath($mess, 'cash'))->assertOk();

    $this->actingAs($mess->manager->user);
    expect($this->getJson(messPath($mess, 'payments'))->json('data'))->toHaveCount(2);
});

it('gives a normal member 403 on staff-only reads and staff 200', function () {
    [$mess, , $month] = mvSetup();
    $paths = ["months/{$month->id}/setup", 'audit', 'adjustments', 'recoverables'];
    foreach ($paths as $p) {
        $this->getJson(messPath($mess, $p))->assertForbidden();
    }
    $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->assertForbidden();

    $this->actingAs($mess->manager->user);
    foreach (["months/{$month->id}/setup", 'audit', 'adjustments', 'recoverables'] as $p) {
        $this->getJson(messPath($mess, $p))->assertOk();
    }
    $this->actingAs($mess->admin->user);
    $this->getJson(messPath($mess, 'audit'))->assertOk();
});

it('keeps members and history open to a normal member, without money fields', function () {
    [$mess] = mvSetup();
    $members = $this->getJson(messPath($mess, 'members'))->assertOk()->json('data');
    expect($members)->toHaveCount(3);
    foreach ($members as $m) {
        expect(array_keys($m))->toBe(['id', 'display_name', 'user_id', 'has_account', 'is_admin', 'is_manager', 'joined_on', 'left_on', 'archived_at']);
    }
    $row = $this->getJson(messPath($mess, 'history'))->assertOk()->json('data.0');
    expect($row)->not->toHaveKey('members')->and($row)->toHaveKey('total_due_paisa');
});
