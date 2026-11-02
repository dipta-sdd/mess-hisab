<?php

use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\Month;

require_once __DIR__.'/BalanceHelpers.php';

it('lists every month newest first with per-month totals', function () {
    [$mess, , $nov, $ids] = jSetup('member');
    $oct = Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[0], 'type' => LedgerType::Charge, 'group' => 'fixed', 'amount_paisa' => -90000]);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[1], 'type' => LedgerType::Charge, 'group' => 'meals', 'amount_paisa' => -60000]);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[1], 'type' => LedgerType::Rounding, 'group' => 'meals', 'amount_paisa' => -40]);
    jPay($mess, $oct, $ids[0], 'fixed', 20000, '2026-10-05');
    jBill($mess, $nov, jCategory($mess, ['name' => 'Wifi']), 90000);

    $res = $this->getJson(messPath($mess, 'history'))->assertOk();
    $rows = $res->json('data');

    expect($rows)->toHaveCount(2);
    foreach ($rows as $row) {
        expectContractShape($row, 'History');
    }
    expect(array_column($rows, 'month_id'))->toBe([$nov->id, $oct->id])
        ->and($rows[0])->toMatchArray(['status' => 'open', 'fixed_charged_paisa' => 90000, 'meals_charged_paisa' => 0, 'total_due_paisa' => 220040, 'total_credit_paisa' => 0])
        ->and($rows[1])->toMatchArray([
            'status' => 'closed', 'fixed_charged_paisa' => 90000, 'meals_charged_paisa' => 60040, 'rounding_extra_paisa' => 40, 'paid_paisa' => 20000,
            'total_due_paisa' => 60040 + 70000, 'total_credit_paisa' => 0,
        ]);
});

it('reads each month once, in order, with the carry flowing through', function () {
    [$mess, , $nov, $ids] = jSetup('member');
    $oct = Month::factory()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    jBill($mess, $oct, jCategory($mess, ['name' => 'Wifi']), 90000);

    $rows = $this->getJson(messPath($mess, 'history'))->json('data');
    $dash = $this->getJson(messPath($mess, "dashboard?month_id={$nov->id}"))->json('data');

    expect($rows[1]['total_due_paisa'])->toBe(90000)
        // November has no bills of its own: everyone just carries October.
        ->and($rows[0]['total_due_paisa'])->toBe(90000)
        ->and(array_sum(array_column($dash['members'], 'carry_in_paisa')))->toBe(-90000)
        ->and($ids)->toHaveCount(3);
});

it('is just the mess\'s own months', function () {
    [$mess] = jSetup('member');
    $foreign = otherMess();
    Month::factory()->create(['mess_id' => $foreign->id]);

    expect($this->getJson(messPath($mess, 'history'))->json('data'))->toHaveCount(1);
});

it('lets an archived member read', function () {
    [$mess] = jSetup('archived');

    $this->getJson(messPath($mess, 'history'))->assertOk();
});

it('needs a login and a mess I belong to', function () {
    $mess = Mess::factory()->create();
    $this->getJson(messPath($mess, 'history'))->assertUnauthorized();

    jSetup('member');
    $this->getJson(messPath($mess, 'history'))->assertNotFound();
});
