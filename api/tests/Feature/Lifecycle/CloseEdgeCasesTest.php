<?php

use App\Models\Month;

require_once __DIR__.'/../Balance/BalanceHelpers.php';
require_once __DIR__.'/CloseReopenTest.php';

it('blocks close on unallocated money in a fixed bill', function () {
    [$mess, , $month, $ids] = jSetup('manager', 3);
    jToday('2026-11-20');
    $rent = jCategory($mess, ['name' => 'Rent', 'split_type' => 'fixed_per_person']);
    jBill($mess, $month, $rent, 750000, [$ids[0] => 200000, $ids[1] => 200000, $ids[2] => 200000]);

    $res = $this->getJson("/api/messes/{$mess->id}/months/{$month->id}/close-check")->assertOk()->json('data');
    $block = collect($res['blocks'])->firstWhere('code', 'unallocated');
    expect($block)->not->toBeNull();
    expect($block['data']['bills'][0]['unallocated_paisa'])->toBe(150000);
    jExpectNestedShape($res, jFixture('CloseCheck'));
});

it('needs a zero-meal resolution and handles split_equal and carry', function () {
    foreach (['split_equal', 'carry'] as $choice) {
        [$mess, , $month, $ids] = jSetup('manager', 3);
        jToday('2026-11-20');
        $bazar = jCategory($mess, ['name' => 'Bazar', 'group' => 'meals', 'split_type' => 'by_meal']);
        jExpense($mess, $month, $bazar, 90000, $ids[0]);
        $before = kBalances($mess->id);

        $base = "/api/messes/{$mess->id}/months/{$month->id}";
        $res = $this->getJson("$base/close-check")->assertOk()->json('data');
        expect(collect($res['blocks'])->pluck('code')->all())->toContain('zero_meals_unresolved');
        $this->postJson("$base/close")->assertStatus(409)->assertJsonPath('code', 'close_blocked');

        $this->postJson("$base/close", ['zero_meal_resolution' => $choice])->assertOk();
        $m = Month::findOrFail($month->id);
        if ($choice === 'carry') {
            expect($m->food_carry_out_paisa)->toBe(90000);
            $next = Month::where('mess_id', $mess->id)->where('starts_on', '>', $month->ends_on)->first();
            expect($next->food_carry_in_paisa)->toBe(90000);
        } else {
            expect($m->food_carry_out_paisa)->toBe(0);
        }

        $this->postJson("$base/reopen")->assertOk();
        expect(Month::findOrFail($month->id)->food_carry_out_paisa)->toBe(0);
        expect(Month::findOrFail($month->id)->zero_meal_resolution?->value)->toBe($choice); // kept so reopening changes no balance
    }
});

it('rounds up per the mess rounding mode and still reconciles', function () {
    [$mess, , $month, $ids] = kScenario();
    $mess->update(['rounding_mode' => 'whole_taka']);
    $before = kBalances($mess->id);
    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertOk();
    expect(kBalances($mess->id))->toBe($before);
});

it('matches the contract shapes', function () {
    [$mess, , $month, $ids] = kScenario();
    $base = "/api/messes/{$mess->id}";

    $this->postJson("$base/months/{$month->id}/close")->assertOk();
    $prev = $this->getJson("$base/months/{$month->id}/reopen-preview")->assertOk()->json('data');
    $fx = jFixture('ReopenPreview');
    $fx['blocks'] = [];
    $fx['next_month'] = $prev['next_month'] ?? null;
    expect(array_keys($prev))->toEqualCanonicalizing(array_keys($fx));
    jExpectNestedShape($prev['members'][0], $fx['members'][0]);
    $this->postJson("$base/months/{$month->id}/reopen")->assertOk();

    $adj = $this->postJson("$base/adjustments", ['member_id' => $ids[0], 'group' => 'fixed', 'amount_paisa' => 100, 'note' => 'n'])
        ->assertCreated()->json('data');
    jExpectNestedShape($adj, jFixture('Adjustment'));

    $rec = $this->postJson("$base/months/{$month->id}/doesnt-pay", ['member_id' => $ids[2], 'mode' => 'equal'])
        ->assertCreated()->json('data');
    $fixture = jFixture('Recoverable');
    expect(array_keys($rec))->toEqualCanonicalizing(array_keys($fixture));
    $this->postJson("$base/months/{$month->id}/close")->assertOk();
    $list = $this->getJson("$base/recoverables")->json('data');
    expect(array_keys($list[0]['shares'][0]))->toEqualCanonicalizing(array_keys($fixture['shares'][0]));
});

it('validates manual doesnt-pay shares', function () {
    [$mess, , $month, $ids] = kScenario();
    $base = "/api/messes/{$mess->id}/months/{$month->id}/doesnt-pay";
    $this->postJson($base, ['member_id' => $ids[2], 'mode' => 'manual', 'manual' => []])->assertUnprocessable();
    $this->postJson($base, ['member_id' => $ids[2], 'mode' => 'manual', 'manual' => [['member_id' => $ids[2], 'amount_paisa' => 5]]])->assertUnprocessable();
    $this->postJson($base, ['member_id' => $ids[2], 'mode' => 'equal', 'manual' => [['member_id' => $ids[0], 'amount_paisa' => 5]]])->assertUnprocessable();
    $this->postJson($base, ['member_id' => $ids[2], 'mode' => 'manual', 'manual' => [['member_id' => $ids[0], 'amount_paisa' => 5000], ['member_id' => $ids[1], 'amount_paisa' => 1000]]])
        ->assertCreated()->assertJsonPath('data.mode', 'manual');
});
