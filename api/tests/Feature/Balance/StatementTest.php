<?php

use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;

require_once __DIR__.'/BalanceHelpers.php';

afterEach(fn () => $this->travelBack());

it('lets any member read any other member\'s statement', function () {
    [$mess, $me, $month, $ids] = jSetup('member');
    $other = collect($ids)->first(fn ($id) => $id !== $me->id);
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);

    $s = $this->getJson(messPath($mess, "statements/{$other}?month_id={$month->id}"))->assertOk()->json('data');

    expectContractShape($s, 'Statement');
    expect($s['member']['id'])->toBe($other)->and($s['total_paisa'])->toBe(-30000);
});

it('lets an archived member read a statement, and shows an archived member\'s own', function () {
    [$mess, $me, $month] = jSetup('archived');
    jPay($mess, $month, $me->id, 'meals', 40000);

    $s = $this->getJson(messPath($mess, "statements/{$me->id}?month_id={$month->id}"))->assertOk()->json('data');

    expect($s['member']['is_archived'])->toBeTrue()
        ->and($s['total_paisa'])->toBe(40000)
        ->and($s['lines'])->toHaveCount(1);
});

it('lists payments, own-pocket expenses and adjustments with their dates and groups', function () {
    [$mess, , $month, $ids] = jSetup('member');
    $x = $ids[0];
    $tea = jCategory($mess, ['name' => 'Tea', 'group' => 'meals', 'split_type' => 'equal']);
    jExpense($mess, $month, $tea, 30000, $x, ['spent_on' => '2026-11-07']);
    jPay($mess, $month, $x, 'fixed', 10000, '2026-11-04');
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $x, 'type' => LedgerType::Adjustment, 'group' => 'fixed', 'amount_paisa' => -2500, 'note' => 'Broken glass']);

    $s = $this->getJson(messPath($mess, "statements/{$x}?month_id={$month->id}"))->json('data');
    $by = collect($s['lines'])->keyBy('kind');

    expect($by['payment'])->toMatchArray(['group' => 'fixed', 'date' => '2026-11-04', 'amount_paisa' => 10000])
        ->and($by['own_pocket_expense'])->toMatchArray(['group' => 'meals', 'date' => '2026-11-07', 'amount_paisa' => 30000])
        ->and($by['adjustment'])->toMatchArray(['label' => 'Broken glass', 'amount_paisa' => -2500])
        // Tea (meals, equal): 30000 / 3 = 10000 each is charged to X as a bill share.
        ->and($by['fixed_bill'])->toMatchArray(['group' => 'meals', 'label' => 'Tea', 'amount_paisa' => -10000])
        ->and(array_sum(array_column($s['lines'], 'amount_paisa')))->toBe($s['total_paisa'])
        ->and($s['total_paisa'])->toBe(10000 + 30000 - 2500 - 10000);
});

it('shows a member who joined late as not active but still readable', function () {
    [$mess, , $month] = jSetup('member');
    $late = MessMember::factory()->for($mess)->create(['joined_on' => '2026-12-05']);

    $s = $this->getJson(messPath($mess, "statements/{$late->id}?month_id={$month->id}"))->assertOk()->json('data');

    expect($s['member']['is_active'])->toBeFalse()->and($s['lines'])->toBe([]);
});

it('needs a login', function () {
    $mess = Mess::factory()->create();

    $this->getJson(messPath($mess, 'statements/1'))->assertUnauthorized();
});

it('is 404 for another mess, another mess\'s member or month, and a missing member', function () {
    [$mess, $me, $month] = jSetup('member');
    $foreign = otherMess();
    $foreignMonth = Month::factory()->create(['mess_id' => $foreign->id]);

    $this->getJson(messPath($foreign, "statements/{$foreign->manager_member_id}"))->assertNotFound();
    $this->getJson(messPath($mess, "statements/{$foreign->manager_member_id}?month_id={$month->id}"))->assertNotFound();
    $this->getJson(messPath($mess, "statements/{$me->id}?month_id={$foreignMonth->id}"))->assertNotFound();
    $this->getJson(messPath($mess, "statements/999999?month_id={$month->id}"))->assertNotFound();
    $this->getJson(messPath($mess, "statements/{$me->id}?month_id={$month->id}"))->assertOk();
});
