<?php

use App\Enums\LedgerType;
use App\Models\AuditLog;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Recoverable;

require_once __DIR__.'/BalanceHelpers.php';

afterEach(fn () => $this->travelBack());

it('replays PROJECT §7 example 2 over HTTP', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    [$x, $y, $z] = $ids;
    jExample2($mess, $month, $ids);
    jToday('2026-11-15');

    $res = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk();
    $d = $res->json('data');

    expectContractShape($d, 'Dashboard');
    jExpectNestedShape($d, jFixture('Dashboard'));
    expect($d['month']['id'])->toBe($month->id)->and($d['today'])->toBe('2026-11-15')
        ->and($d['totals']['meal_rate_paisa'])->toBe(4000)
        ->and($d['totals']['total_meals_centi'])->toBe(5000)
        ->and($d['totals']['food_cost_paisa'])->toBe(200000)
        ->and($d['totals']['fixed_bills_paisa'])->toBe(840000)
        ->and($d['totals']['charged_paisa'])->toBe(1040000)
        ->and($d['cash_pool_paisa'])->toBe(0)
        ->and($d['manager_member_id'])->toBe($mess->manager_member_id)
        ->and($d['members'])->toHaveCount(3);

    expect(jRow($d, $x))->toMatchArray([
        'fixed_bill_paisa' => 230000, 'meals_bill_paisa' => 80000, 'fixed_balance_paisa' => -230000, 'meals_balance_paisa' => 70000,
        'balance_paisa' => -160000, 'fixed_outstanding_paisa' => 230000, 'fixed_overdue_days' => 5,
        'deposit_outstanding_paisa' => 0, 'deposit_overdue_days' => 0, 'meals_centi' => 2000,
    ]);
    expect(jRow($d, $y))->toMatchArray([
        'fixed_bill_paisa' => 380000, 'meals_bill_paisa' => 40000, 'balance_paisa' => -420000,
        'fixed_outstanding_paisa' => 380000, 'fixed_overdue_days' => 5, 'deposit_outstanding_paisa' => 100000, 'deposit_overdue_days' => 10,
    ]);
    expect(jRow($d, $z))->toMatchArray([
        'fixed_bill_paisa' => 230000, 'meals_bill_paisa' => 80000, 'paid_paisa' => 50000, 'balance_paisa' => -260000,
        'deposit_outstanding_paisa' => 50000, 'deposit_overdue_days' => 10,
    ]);

    $manager = collect($d['members'])->firstWhere('member_id', $mess->manager_member_id);
    expect($d['manager_balance_paisa'])->toBe($manager['balance_paisa']);
});

it('shows each statement line and reconciles to the dashboard total (example 2)', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    [$x, , $z] = $ids;
    jExample2($mess, $month, $ids);
    jToday('2026-11-15');

    $s = $this->getJson(messPath($mess, "statements/{$x}?month_id={$month->id}"))->assertOk()->json('data');

    expectContractShape($s, 'Statement');
    jExpectNestedShape($s, jFixture('Statement'));
    $byKind = collect($s['lines'])->groupBy('kind');
    expect($byKind['fixed_bill']->pluck('amount_paisa', 'label')->all())->toBe(['Rent' => -200000, 'Wifi' => -30000])
        ->and($byKind['meal_charge'][0]['amount_paisa'])->toBe(-80000)
        ->and($byKind['own_pocket_expense'][0]['amount_paisa'])->toBe(150000)
        ->and($byKind->has('rounding'))->toBeFalse()
        ->and($s['total_paisa'])->toBe(-160000)
        ->and(array_sum(array_column($s['lines'], 'amount_paisa')))->toBe($s['total_paisa']);

    $sz = $this->getJson(messPath($mess, "statements/{$z}?month_id={$month->id}"))->json('data');
    expect(collect($sz['lines'])->firstWhere('kind', 'payment'))->toMatchArray(['group' => 'meals', 'amount_paisa' => 50000, 'date' => '2026-11-03'])
        ->and(array_sum(array_column($sz['lines'], 'amount_paisa')))->toBe(-260000)
        ->and($sz['deposit_outstanding_paisa'])->toBe(50000);
});

it('applies whole-taka rounding per member and shows it as its own statement line (example 1)', function () {
    [$mess, , $month, $ids] = jSetup('manager', 4);
    $mess->update(['rounding_mode' => 'whole_taka', 'min_meals_enabled' => true, 'min_meals_centi' => 2000]);
    $bazar = jCategory($mess, ['name' => 'Bazar', 'group' => 'meals', 'split_type' => 'by_meal']);
    jExpense($mess, $month, $bazar, 800000, $ids[0]);
    foreach ([6000, 5000, 4000, 1000] as $i => $centi) {
        jMeals($mess, $month, $ids[$i], $centi);
    }

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk()->json('data');

    expect(array_column($d['members'], 'meals_bill_paisa'))->toBe([282400, 235300, 188200, 94100])
        ->and(array_column($d['members'], 'effective_meals_centi'))->toBe([6000, 5000, 4000, 2000])
        ->and($d['totals']['rounding_extra_paisa'])->toBe(0);

    $s = $this->getJson(messPath($mess, "statements/{$ids[0]}?month_id={$month->id}"))->json('data');
    $rounding = collect($s['lines'])->firstWhere('kind', 'rounding');
    expect($rounding['amount_paisa'])->toBe(-47) // exact 2823.53 charged as 2824.00
        ->and(collect($s['lines'])->firstWhere('kind', 'meal_charge')['amount_paisa'])->toBe(-282353)
        ->and(array_sum(array_column($s['lines'], 'amount_paisa')))->toBe($s['total_paisa']);
});

it('reports the extra collected by round-up mode', function () {
    [$mess, , $month] = jSetup('manager');
    $mess->update(['rounding_mode' => 'round_up']);
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 156345);

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data');

    expect(array_column($d['members'], 'fixed_bill_paisa'))->toBe([52200, 52200, 52200])
        ->and($d['totals']['rounding_extra_paisa'])->toBe(255);
});

it('carries "last month due" from a closed earlier month and from opening rows', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    [$x, $y] = $ids;
    $oct = Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    // Oct, stored: X was charged 1000, paid 300 (so owes 700); Y was charged 100, paid 500 (credit 400).
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $x, 'type' => LedgerType::Charge, 'group' => 'fixed', 'amount_paisa' => -100000]);
    jPay($mess, $oct, $x, 'fixed', 30000, '2026-10-05');
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $y, 'type' => LedgerType::Charge, 'group' => 'fixed', 'amount_paisa' => -10000]);
    jPay($mess, $oct, $y, 'meals', 50000, '2026-10-06');
    // Nov: an opening row of -50 for Y on top of that.
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $y, 'type' => LedgerType::Opening, 'group' => 'fixed', 'amount_paisa' => -5000]);
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data');

    expect(jRow($d, $x))->toMatchArray(['carry_in_paisa' => -70000, 'fixed_balance_paisa' => -100000, 'balance_paisa' => -100000])
        ->and(jRow($d, $y))->toMatchArray(['carry_in_paisa' => 35000, 'fixed_balance_paisa' => 0, 'meals_balance_paisa' => 5000, 'balance_paisa' => 5000]);

    $s = $this->getJson(messPath($mess, "statements/{$x}?month_id={$month->id}"))->json('data');
    expect($s['carry_in_paisa'])->toBe(-70000)
        ->and(collect($s['lines'])->firstWhere('kind', 'carry_in'))->toMatchArray(['label' => 'Last month due', 'amount_paisa' => -70000])
        ->and(array_sum(array_column($s['lines'], 'amount_paisa')))->toBe(-100000);
});

it('carries an earlier month that is still open (live charges, replayed in order)', function () {
    [$mess, , $nov, $ids] = jSetup('manager');
    $oct = Month::factory()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    jBill($mess, $oct, jCategory($mess, ['name' => 'Wifi']), 90000);
    jPay($mess, $oct, $ids[0], 'fixed', 50000, '2026-10-04');

    $octDash = $this->getJson(messPath($mess, "dashboard?month_id={$oct->id}"))->json('data');
    $novDash = $this->getJson(messPath($mess, "dashboard?month_id={$nov->id}"))->json('data');

    expect(jRow($octDash, $ids[0])['balance_paisa'])->toBe(20000);
    foreach ($ids as $id) {
        expect(jRow($novDash, $id)['carry_in_paisa'])->toBe(jRow($octDash, $id)['balance_paisa']);
    }
    expect(array_sum(array_column($novDash['members'], 'carry_in_paisa')))->toBe(-40000);
});

it('reads a closed month from its stored ledger rows, not from the raw bills', function () {
    [$mess, , , $ids] = jSetup('manager');
    $oct = Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31', 'closed_at' => '2026-11-02 08:00:00']);
    // Nothing in bills/expenses/meals: only the rows task K would have written.
    $rows = [
        [$ids[0], LedgerType::Charge, 'fixed', -230000], [$ids[0], LedgerType::Charge, 'meals', -80000], [$ids[0], LedgerType::Rounding, 'meals', -47],
        [$ids[1], LedgerType::Charge, 'fixed', -380000], [$ids[2], LedgerType::Charge, 'fixed', -230000],
    ];
    foreach ($rows as [$member, $type, $group, $amount]) {
        LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $member, 'type' => $type, 'group' => $group, 'amount_paisa' => $amount]);
    }
    jPay($mess, $oct, $ids[0], 'fixed', 100000, '2026-10-09');
    $before = LedgerEntry::count();

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$oct->id}"))->assertOk()->json('data');

    expect($d['month']['status'])->toBe('closed')
        ->and(jRow($d, $ids[0]))->toMatchArray(['fixed_bill_paisa' => 230000, 'meals_bill_paisa' => 80047, 'fixed_balance_paisa' => -130000, 'meals_balance_paisa' => -80047, 'balance_paisa' => -210047])
        ->and(jRow($d, $ids[1])['balance_paisa'])->toBe(-380000)
        ->and($d['totals']['rounding_extra_paisa'])->toBe(47)
        ->and(LedgerEntry::count())->toBe($before);

    $s = $this->getJson(messPath($mess, "statements/{$ids[0]}?month_id={$oct->id}"))->json('data');
    expect(collect($s['lines'])->where('kind', 'charge')->count())->toBe(2)
        ->and(collect($s['lines'])->firstWhere('kind', 'rounding')['amount_paisa'])->toBe(-47)
        ->and(array_sum(array_column($s['lines'], 'amount_paisa')))->toBe(-210047);
});

it('counts overdue days after the deadline and none before or on it', function (string $today, int $days) {
    [$mess, , $month, $ids] = jSetup('manager');
    $month->update(['fixed_deadline' => '2026-11-10']);
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);
    jToday($today);

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data');

    expect(jRow($d, $ids[0])['fixed_overdue_days'])->toBe($days)
        ->and(jRow($d, $ids[0])['fixed_outstanding_paisa'])->toBe(30000);
})->with([
    'before the deadline' => ['2026-11-08', 0],
    'on the deadline' => ['2026-11-10', 0],
    'five days late' => ['2026-11-15', 5],
]);

it('stops counting overdue once the member has paid', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    $month->update(['fixed_deadline' => '2026-11-10']);
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);
    jPay($mess, $month, $ids[0], 'fixed', 30000);
    jToday('2026-11-20');

    $row = jRow($this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data'), $ids[0]);

    expect($row)->toMatchArray(['fixed_outstanding_paisa' => 0, 'fixed_overdue_days' => 0, 'balance_paisa' => 0]);
});

it('shows a pending doesn\'t-pay request live without storing anything', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);
    Recoverable::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'debtor_member_id' => $ids[2], 'created_by_member_id' => $ids[2]]);
    $before = LedgerEntry::count();

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data');

    expect(jRow($d, $ids[2])['balance_paisa'])->toBe(0)
        ->and(jRow($d, $ids[0])['balance_paisa'])->toBe(-45000)
        ->and(jRow($d, $ids[1])['balance_paisa'])->toBe(-45000)
        ->and(LedgerEntry::count())->toBe($before);

    $s = $this->getJson(messPath($mess, "statements/{$ids[2]}?month_id={$month->id}"))->json('data');
    expect(collect($s['lines'])->firstWhere('kind', 'doesnt_pay_out')['amount_paisa'])->toBe(30000);
});

it('defaults to the month containing today and never creates one', function () {
    [$mess, , $month] = jSetup('manager');
    jToday('2026-11-12');
    $count = Month::count();

    $d = $this->getJson(messPath($mess, 'dashboard'))->assertOk()->json('data');

    expect($d['month']['id'])->toBe($month->id)->and(Month::count())->toBe($count);
});

it('lets an archived member read', function () {
    [$mess, , $month] = jSetup('archived');

    $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk();
});

it('lists an archived member as a row with their balance', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    $gone = MessMember::factory()->for($mess)->archived()->create();
    jPay($mess, $month, $gone->id, 'fixed', 12000);

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data');

    expect(jRow($d, $gone->id))->toMatchArray(['is_archived' => true, 'balance_paisa' => 12000]);
});

it('needs a login', function () {
    $mess = Mess::factory()->create();

    $this->getJson(messPath($mess, 'dashboard'))->assertUnauthorized();
});

it('is 404 for a mess I am not in, and for another mess\'s or a missing month', function () {
    [$mess, , $month] = jSetup('manager');
    $foreign = otherMess();
    $foreignMonth = Month::factory()->create(['mess_id' => $foreign->id]);

    $this->getJson(messPath($foreign, 'dashboard'))->assertNotFound();
    $this->getJson(messPath($mess, "dashboard?month_id={$foreignMonth->id}"))->assertNotFound();
    $this->getJson(messPath($mess, 'dashboard?month_id='.($foreignMonth->id + 999)))->assertNotFound();
    $this->getJson(messPath($mess, 'dashboard?month_id=abc'))->assertUnprocessable();
    $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk();
});

it('writes nothing', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    jExample2($mess, $month, $ids);
    Recoverable::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'debtor_member_id' => $ids[1], 'created_by_member_id' => $ids[1]]);
    $counts = fn () => [LedgerEntry::count(), Month::count(), AuditLog::count(), MessMember::count(), Recoverable::count()];
    $before = $counts();

    $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk();
    $this->getJson(messPath($mess, "statements/{$ids[0]}?month_id={$month->id}"))->assertOk();
    $this->getJson(messPath($mess, 'history'))->assertOk();

    expect($counts())->toBe($before);
});

it('never lets a meals credit reduce a fixed due, but lets a fixed credit cover a meals due', function () {
    [$mess, , $month, $ids] = jSetup('manager');
    [$x, $y] = $ids;
    // X: fixed due 1000, meals credit 400 (paid into meals). Y: fixed credit 500, meals due 300.
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $x, 'type' => LedgerType::Opening, 'group' => 'fixed', 'amount_paisa' => -100000]);
    jPay($mess, $month, $x, 'meals', 40000, '2026-11-02');
    jPay($mess, $month, $y, 'fixed', 50000, '2026-11-02');
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $y, 'type' => LedgerType::Opening, 'group' => 'meals', 'amount_paisa' => -30000]);

    $d = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->json('data');

    expect(jRow($d, $x))->toMatchArray(['fixed_balance_paisa' => -100000, 'meals_balance_paisa' => 40000, 'fixed_outstanding_paisa' => 100000])
        ->and(jRow($d, $y))->toMatchArray(['fixed_balance_paisa' => 0, 'meals_balance_paisa' => 20000, 'balance_paisa' => 20000]);
});
