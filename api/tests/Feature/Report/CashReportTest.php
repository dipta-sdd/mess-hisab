<?php

use App\Models\Category;
use App\Models\LedgerEntry;
use App\Models\Month;

require_once __DIR__.'/../Lifecycle/LifecycleHelpers.php';

/**
 * kScenario + each of 3 members deposits ৳2,000 (fixed). Rent is charged ৳3,000; the manager actually paid
 * $rentPaid of it from cash, so ৳3,000 - $rentPaid is cash no balance covers.
 */
function cScenario(int $rentPaid = 270000): array
{
    [$mess, $me, $month, $ids] = kScenario('admin_manager');
    foreach ($ids as $id) {
        jPay($mess, $month, $id, 'fixed', 200000);
    }
    $rent = Category::query()->where('mess_id', $mess->id)->where('name', 'Rent')->firstOrFail();
    jExpense($mess, $month, $rent, $rentPaid);

    return [$mess, $month, $ids, $rent];
}

it('lists payments and cash, and reconciles cash in hand with the balances', function () {
    [$mess, $month, $ids] = cScenario();

    $data = $this->postJson("/api/messes/{$mess->id}/reports/monthly/{$month->id}/preview")->assertOk()->json('data');

    expect($data['payments'])->toHaveCount(3);
    expect(array_sum(array_column($data['payments'], 'amount_paisa')))->toBe(600000);
    expect($data['summary']['cash_spent_paisa'])->toBe(270000);
    expect($data['summary']['spent_paisa'])->toBe(90000);

    $c = $data['cash'];
    expect($c['in_hand_paisa'])->toBe(330000);
    expect($c['owed_to_members_paisa'] - $c['owed_by_members_paisa'])->toBe(300000);
    expect($c['unpaid_fixed_bills_paisa'])->toBe(30000);
    expect($c['other_paisa'])->toBe(0);
    expect($c['extra_paisa'])->toBe(30000);
    expect($c['in_hand_paisa'])->toBe($c['owed_to_members_paisa'] - $c['owed_by_members_paisa'] + $c['unpaid_fixed_bills_paisa'] + $c['other_paisa']);
});

it('has no extra when the bill was paid in full', function () {
    [$mess, $month] = cScenario(300000);

    $c = $this->postJson("/api/messes/{$mess->id}/reports/monthly/{$month->id}/preview")->json('data.cash');

    expect($c['in_hand_paisa'])->toBe(300000);
    expect($c['extra_paisa'])->toBe(0);
});

it('previews sharing the spare cash without saving it', function () {
    [$mess, $month, $ids] = cScenario();
    $before = kBalances($mess->id);

    $data = $this->postJson("/api/messes/{$mess->id}/reports/monthly/{$month->id}/preview", ['surplus_paisa' => 30000])->assertOk()->json('data');

    expect($data['summary']['shared_extra_paisa'])->toBe(30000);
    expect($data['preview']['surplus_available_paisa'])->toBe(30000);
    foreach ($data['members'] as $m) {
        expect($m['balance_paisa'])->toBe($before[$m['member_id']] + 10000);
    }
    expect(kBalances($mess->id))->toBe($before);
    expect(LedgerEntry::query()->where('mess_id', $mess->id)->where('note', 'Spare cash shared equally')->count())->toBe(0);
});

it('shares spare cash equally on close, sends the crumb to the manager, and takes it back on reopen', function () {
    [$mess, $month, $ids] = cScenario(270001); // ৳0.01 less spent -> 29999 spare: 9999 each, crumb 2 to the manager
    $before = kBalances($mess->id);

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close", ['surplus_paisa' => 29999])->assertOk();

    $after = kBalances($mess->id);
    $gain = array_map(fn ($id) => $after[$id] - $before[$id], $ids);
    expect(array_sum($gain))->toBe(29999);
    expect($gain[array_search($mess->manager_member_id, $ids)])->toBe(10001);
    expect(collect($gain)->sort()->values()->all()[0])->toBe(9999);

    $next = Month::query()->where('mess_id', $mess->id)->where('starts_on', '>', $month->ends_on)->firstOrFail();
    jBill($mess, $next, Category::query()->where('mess_id', $mess->id)->where('name', 'Rent')->firstOrFail(), 300000);
    $report = $this->getJson("/api/messes/{$mess->id}/reports/monthly/{$month->id}")->assertOk()->json('data');
    expect($report['summary']['shared_extra_paisa'])->toBe(29999);
    expect($report['cash']['in_hand_paisa'])->toBe(329999);
    expect($report['cash']['extra_paisa'])->toBe(0);
    \App\Models\MonthBill::query()->where('month_id', $next->id)->delete();

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/reopen")->assertOk();
    expect(kBalances($mess->id))->toBe($before);
    expect(LedgerEntry::query()->where('mess_id', $mess->id)->where('note', 'Spare cash shared equally')->count())->toBe(0);
});

it('refuses to share more than the spare cash', function () {
    [$mess, $month] = cScenario();

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close", ['surplus_paisa' => 30001])
        ->assertStatus(409)->assertJsonPath('code', 'exceeds_surplus')->assertJsonPath('available_paisa', 30000);
    expect($month->fresh()->status->value)->toBe('open');
});

it('tells the close popup how much is spare', function () {
    [$mess, $month] = cScenario();

    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close-preview")->assertOk()
        ->assertJsonPath('data.surplus_available_paisa', 30000);
});
