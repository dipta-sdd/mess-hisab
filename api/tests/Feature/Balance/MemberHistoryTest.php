<?php

use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;

require_once __DIR__.'/BalanceHelpers.php';

afterEach(fn () => $this->travelBack());

/** Closed October (stored charges, a carry into November) plus open November for a 3-member mess. */
function mhSetup(): array
{
    [$mess, $me, $nov, $ids] = jSetup('manager');
    $oct = Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[0], 'type' => LedgerType::Charge, 'group' => 'fixed', 'amount_paisa' => -90000]);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[0], 'type' => LedgerType::Charge, 'group' => 'meals', 'amount_paisa' => -60000]);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[0], 'type' => LedgerType::Rounding, 'group' => 'meals', 'amount_paisa' => -40]);
    jPay($mess, $oct, $ids[0], 'fixed', 20000, '2026-10-05');
    jPay($mess, $oct, $ids[0], 'meals', 5000, '2026-10-06');

    jBill($mess, $nov, jCategory($mess, ['name' => 'Wifi']), 90000);
    jPay($mess, $nov, $ids[0], 'fixed', 10000);
    jMeals($mess, $nov, $ids[0], 1000);

    return [$mess, $me, $nov, $oct, $ids];
}

it('lists the member\'s months newest first, matching the fixture and the statement endpoint', function () {
    [$mess, , $nov, $oct, $ids] = mhSetup();

    $rows = $this->getJson(messPath($mess, "statements/{$ids[0]}/history"))->assertOk()->json('data');

    expect($rows)->toHaveCount(2)
        ->and(array_column($rows, 'month_id'))->toBe([$nov->id, $oct->id])
        ->and(array_column($rows, 'status'))->toBe(['open', 'closed']);

    foreach ($rows as $row) {
        expectContractShape($row, 'MemberHistory');
        $s = $this->getJson(messPath($mess, "statements/{$ids[0]}?month_id={$row['month_id']}"))->assertOk()->json('data');
        $lines = collect($s['lines']);

        expect($row['balance_paisa'])->toBe($s['total_paisa'])
            ->and($row['paid_paisa'])->toBe($lines->where('kind', 'payment')->sum('amount_paisa'))
            ->and($row['charged_paisa'])->toBe(-$lines->whereIn('kind', ['fixed_bill', 'meal_charge', 'charge', 'rounding'])->sum('amount_paisa'));
    }

    expect($rows[1])->toMatchArray(['starts_on' => '2026-10-01', 'ends_on' => '2026-10-31', 'charged_paisa' => 150040, 'paid_paisa' => 25000, 'balance_paisa' => -125040])
        // November: the carried-in October due is in the balance but not in "charged".
        ->and($rows[0]['paid_paisa'])->toBe(10000)
        ->and($rows[0]['charged_paisa'])->toBeGreaterThan(0);
});

it('has no rows for months before the member joined', function () {
    [$mess, , , $oct] = mhSetup();
    $late = MessMember::factory()->for($mess)->create(['joined_on' => '2026-11-02']);

    $rows = $this->getJson(messPath($mess, "statements/{$late->id}/history"))->assertOk()->json('data');

    expect($rows)->toHaveCount(1)
        ->and($rows[0]['status'])->toBe('open')
        ->and(array_column($rows, 'month_id'))->not->toContain($oct->id);
});

it('is 404 for another mess\'s member, a missing member, and another mess', function () {
    [$mess] = mhSetup();
    $foreign = otherMess();

    $this->getJson(messPath($mess, "statements/{$foreign->manager_member_id}/history"))->assertNotFound();
    $this->getJson(messPath($mess, 'statements/999999/history'))->assertNotFound();
    $this->getJson(messPath($foreign, "statements/{$foreign->manager_member_id}/history"))->assertNotFound();
});

it('lets an archived member read', function () {
    [$mess, $me] = jSetup('archived');

    $this->getJson(messPath($mess, "statements/{$me->id}/history"))->assertOk();
});

it('needs a login', function () {
    $mess = Mess::factory()->create();

    $this->getJson(messPath($mess, 'statements/1/history'))->assertUnauthorized();
});

it('writes nothing', function () {
    [$mess, , , , $ids] = mhSetup();
    $counts = fn () => [LedgerEntry::count(), Month::count(), MessMember::count()];
    $before = $counts();

    $this->getJson(messPath($mess, "statements/{$ids[0]}/history"))->assertOk();

    expect($counts())->toBe($before);
});
