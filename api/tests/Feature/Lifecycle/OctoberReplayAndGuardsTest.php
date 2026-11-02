<?php

use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\Month;
use App\Models\Recoverable;

require_once __DIR__.'/LifecycleHelpers.php';

/** Excel October: S/D/N pay 345000/837200/276000 from pocket, equal meals, two_decimals. Returns [mess, month, ids]. */
function kOctober(): array
{
    [$mess, , $month, $ids] = jSetup('manager', 3);
    jToday('2026-11-20');
    $mess->update(['rounding_mode' => 'two_decimals']);
    $bazar = jCategory($mess, ['name' => 'Bazar', 'group' => 'meals', 'split_type' => 'by_meal']);
    jExpense($mess, $month, $bazar, 345000, $ids[0]);
    jExpense($mess, $month, $bazar, 837200, $ids[1]);
    jExpense($mess, $month, $bazar, 276000, $ids[2]);
    foreach ($ids as $id) {
        jMeals($mess, $month, $id, 1000);
    }

    return [$mess, $month, $ids];
}

function kBlocks(array $json): array
{
    return collect($json['blocks'])->pluck('code')->all();
}

it('replays Excel October with Nilu not paying: S -246100, D +246100, N 0, recoverable 210066', function () {
    [$mess, $month, $ids] = kOctober();
    [$s, $d, $n] = $ids;
    $base = "/api/messes/{$mess->id}";

    expect(kBalances($mess->id))->toBe([$s => -141067, $d => 351133, $n => -210066]);

    $rec = $this->postJson("$base/months/{$month->id}/doesnt-pay", ['member_id' => $n, 'mode' => 'equal'])
        ->assertCreated()->json('data');
    expect(kBalances($mess->id))->toBe([$s => -246100, $d => 246100, $n => 0]);

    $this->postJson("$base/months/{$month->id}/close")->assertOk();
    expect(kBalances($mess->id))->toBe([$s => -246100, $d => 246100, $n => 0]);

    $list = $this->getJson("$base/recoverables")->assertOk()->json('data');
    expect($list)->toHaveCount(1);
    expect($list[0]['id'])->toBe($rec['id']);
    expect($list[0]['amount_paisa'])->toBe(210066)->and($list[0]['status'])->toBe('open')->and($list[0]['repaid_paisa'])->toBe(0);
    expect($list[0]['shares'])->toBe([
        ['member_id' => $s, 'amount_paisa' => 105033, 'manual_amount_paisa' => null],
        ['member_id' => $d, 'amount_paisa' => 105033, 'manual_amount_paisa' => null],
    ]);

    // Ledger: charges + rounding net to exactly -(charged); doesnt-pay rows net to zero across members.
    $rows = LedgerEntry::where('source_type', 'month_close')->where('source_id', $month->id)->get();
    expect((int) $rows->where('type.value', 'doesnt_pay_out')->sum('amount_paisa') + (int) $rows->where('type.value', 'doesnt_pay_in')->sum('amount_paisa'))->toBe(0);
    expect((int) $rows->where('member_id', $n)->where('type.value', 'doesnt_pay_out')->sum('amount_paisa'))->toBe(210066);

    // Nilu repays in two parts; credits split by the saved shares, exactly.
    $this->postJson("$base/recoverables/{$rec['id']}/repayments", ['amount_paisa' => 100001, 'paid_on' => '2026-11-22'])->assertCreated();
    $this->postJson("$base/recoverables/{$rec['id']}/repayments", ['amount_paisa' => 110065, 'paid_on' => '2026-11-23'])
        ->assertCreated()->assertJsonPath('data.status', 'settled');
    $credits = LedgerEntry::where('source_type', 'recoverable_repayment')->selectRaw('member_id, sum(amount_paisa) s')->groupBy('member_id')->pluck('s', 'member_id')->all();
    expect(array_map('intval', $credits))->toBe([$s => 105033, $d => 105033]);
    expect(Recoverable::find($rec['id'])->repaid_paisa)->toBe(210066);
});

it('final settlement pays a known credit and enforces both caps', function () {
    [$mess, $month, $ids] = kOctober();
    [$s, $d, $n] = $ids;
    $base = "/api/messes/{$mess->id}";
    $this->postJson("$base/months/{$month->id}/doesnt-pay", ['member_id' => $n, 'mode' => 'equal'])->assertCreated();

    // Credit 246100, cash pool empty (all spending was from pockets).
    $this->postJson("$base/members/{$d}/final-settlement", ['amount_paisa' => 100, 'paid_on' => '2026-11-21'])
        ->assertStatus(409)->assertJsonPath('code', 'exceeds_cash');

    jPay($mess, $month, $s, 'meals', 300000, '2026-11-10'); // fund the pool from Shuvendu; Dipta's credit is untouched
    $this->postJson("$base/members/{$d}/final-settlement", ['amount_paisa' => 246101, 'paid_on' => '2026-11-21'])
        ->assertStatus(409)->assertJsonPath('code', 'exceeds_credit')->assertJsonPath('credit_paisa', 246100);
    $this->postJson("$base/members/{$d}/final-settlement", ['amount_paisa' => 300001, 'paid_on' => '2026-11-21'])
        ->assertStatus(409);

    $res = $this->postJson("$base/members/{$d}/final-settlement", ['amount_paisa' => 246100, 'paid_on' => '2026-11-21'])
        ->assertCreated()->json('data');
    expect($res['credit_after_paisa'])->toBe(0)->and($res['cash_pool_paisa'])->toBe(300000 - 246100);
    jExpectNestedShape($res, jFixture('SettlementResult'));
    expect(kBalances($mess->id)[$d])->toBe(0);
});

it('reports previous_month_open on close-check', function () {
    [$mess, $month] = kOctober();
    Month::factory()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    $res = $this->getJson("/api/messes/{$mess->id}/months/{$month->id}/close-check")->assertOk()->json('data');
    expect(kBlocks($res))->toContain('previous_month_open');
    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertStatus(409)->assertJsonPath('code', 'close_blocked');
});

it('refuses reopening an older month while a later one is closed', function () {
    [$mess, $month] = kOctober();
    $oct = Month::factory()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    $base = "/api/messes/{$mess->id}/months";
    $this->postJson("$base/{$oct->id}/close")->assertOk();
    $this->postJson("$base/{$month->id}/close")->assertOk();

    $prev = $this->getJson("$base/{$oct->id}/reopen-preview")->assertOk()->json('data');
    expect($prev['can_reopen'])->toBeFalse();
    expect(kBlocks($prev))->toContain('not_latest_closed');
    $this->postJson("$base/{$oct->id}/reopen")->assertStatus(409)->assertJsonPath('code', 'not_latest_closed');
});

it('refuses reopening when the next month already has data or a payout followed the close', function () {
    [$mess, $month, $ids] = kOctober();
    $base = "/api/messes/{$mess->id}";
    $this->postJson("$base/months/{$month->id}/close")->assertOk();
    $next = Month::where('mess_id', $mess->id)->where('starts_on', '>', '2026-11-30')->firstOrFail();

    jPay($mess, $next, $ids[2], 'meals', 300000, '2026-12-02');
    $prev = $this->getJson("$base/months/{$month->id}/reopen-preview")->assertOk()->json('data');
    expect(kBlocks($prev))->toContain('next_month_has_data');
    expect(array_keys($prev))->toEqualCanonicalizing(array_keys(jFixture('ReopenPreview')));
    expect(array_keys($prev['members'][0]))->toEqualCanonicalizing(array_keys(jFixture('ReopenPreview')['members'][0]));

    $this->postJson("$base/members/{$ids[1]}/final-settlement", ['amount_paisa' => 1000, 'paid_on' => '2026-11-28'])->assertCreated();
    $prev = $this->getJson("$base/months/{$month->id}/reopen-preview")->assertOk()->json('data');
    expect(kBlocks($prev))->toContain('payout_after_close')->and($prev['can_reopen'])->toBeFalse();
    $this->postJson("$base/months/{$month->id}/reopen")->assertStatus(409);
});

it('keeps the cross-mess boundary on every id in the path', function () {
    [$mess, $month, $ids] = kOctober();
    $other = otherMess();
    $otherMonth = Month::factory()->create(['mess_id' => $other->id]);
    $base = "/api/messes/{$mess->id}";

    // A month of another mess under my mess id.
    $this->getJson("$base/months/{$otherMonth->id}/close-check")->assertNotFound();
    $this->postJson("$base/months/{$otherMonth->id}/close")->assertNotFound();
    $this->postJson("$base/months/{$otherMonth->id}/doesnt-pay", ['member_id' => $ids[0], 'mode' => 'equal'])->assertNotFound();
    // A member / recoverable of another mess.
    $this->postJson("$base/members/{$other->manager_member_id}/final-settlement", ['amount_paisa' => 1, 'paid_on' => '2026-11-20'])->assertNotFound();
    $foreign = Recoverable::factory()->create(['mess_id' => $other->id, 'month_id' => $otherMonth->id, 'debtor_member_id' => $other->manager_member_id]);
    $this->postJson("$base/recoverables/{$foreign->id}/repayments", ['amount_paisa' => 1, 'paid_on' => '2026-11-20'])->assertNotFound();
    $this->deleteJson("$base/months/{$month->id}/doesnt-pay/{$foreign->id}")->assertNotFound();
    // Someone else's mess entirely.
    $this->postJson("/api/messes/{$other->id}/months/{$otherMonth->id}/close")->assertNotFound();
});

it('forbids a plain member on every manager endpoint', function () {
    [$mess, , $month, $ids] = jSetup('member', 3);
    $base = "/api/messes/{$mess->id}";
    $this->postJson("$base/months/{$month->id}/doesnt-pay", ['member_id' => $ids[0], 'mode' => 'equal'])->assertForbidden();
    $rec = Recoverable::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'debtor_member_id' => $ids[0]]);
    $this->deleteJson("$base/months/{$month->id}/doesnt-pay/{$rec->id}")->assertForbidden();
    $this->postJson("$base/recoverables/{$rec->id}/repayments", ['amount_paisa' => 1, 'paid_on' => '2026-11-20'])->assertForbidden();
    $this->postJson("$base/members/{$ids[0]}/final-settlement", ['amount_paisa' => 1, 'paid_on' => '2026-11-20'])->assertForbidden();
});

it('blocks close on cash and doesnt-pay mismatches', function () {
    [$mess, $month, $ids] = kOctober();
    $base = "/api/messes/{$mess->id}";

    // Manual doesn't-pay that does not add up to Nilu's 210066.
    $this->postJson("$base/months/{$month->id}/doesnt-pay", [
        'member_id' => $ids[2], 'mode' => 'manual',
        'manual' => [['member_id' => $ids[0], 'amount_paisa' => 100000], ['member_id' => $ids[1], 'amount_paisa' => 100000]],
    ])->assertCreated();
    $res = $this->getJson("$base/months/{$month->id}/close-check")->assertOk()->json('data');
    expect(kBlocks($res))->toContain('doesnt_pay_mismatch');
    $block = collect($res['blocks'])->firstWhere('code', 'doesnt_pay_mismatch');
    expect($block['data']['doesnt_pay'][0]['mismatch_paisa'])->toBe(10066);

    // Cash mismatch: a stray ledger credit with no matching cash.
    LedgerEntry::factory()->create([
        'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $ids[0], 'type' => 'adjustment',
        'group' => 'fixed', 'amount_paisa' => 777, 'note' => 'x',
    ]);
    $fresh = $this->getJson("$base/months/{$month->id}/close-check")->assertOk()->json('data');
    expect(kBlocks($fresh))->toContain('doesnt_pay_mismatch');
});
