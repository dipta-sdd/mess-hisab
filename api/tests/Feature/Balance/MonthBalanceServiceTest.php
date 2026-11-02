<?php

use App\Billing\Dto\BalanceResult;
use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Month;
use App\Services\Balance\MonthBalanceService;
use App\Support\MessContext;

require_once __DIR__.'/BalanceHelpers.php';

afterEach(fn () => $this->travelBack());

it('returns the engine BalanceResult for an open month (example 2)', function () {
    [$mess, , $month, $ids] = jSetup('member');
    jExample2($mess, $month, $ids);
    jToday('2026-11-15');

    $result = app(MonthBalanceService::class)->forMonth($month);

    expect($result)->toBeInstanceOf(BalanceResult::class)
        ->and(array_map(fn ($m) => $m->totalPaisa, $result->members))->toBe([$ids[0] => -160000, $ids[1] => -420000, $ids[2] => -260000])
        ->and($result->members[$ids[0]]->fixedOverdueDays)->toBe(5)
        ->and($result->members[$ids[1]]->depositOverdueDays)->toBe(10);
});

it('reads stored rows for a closed month and writes nothing', function () {
    [$mess, , , $ids] = jSetup('member');
    $oct = Month::factory()->closed()->create(['mess_id' => $mess->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    LedgerEntry::factory()->create(['mess_id' => $mess->id, 'month_id' => $oct->id, 'member_id' => $ids[0], 'type' => LedgerType::Charge, 'group' => 'fixed', 'amount_paisa' => -70000]);
    $before = LedgerEntry::count();

    $result = app(MonthBalanceService::class)->forMonth($oct);

    expect($result->members[$ids[0]]->totalPaisa)->toBe(-70000)
        ->and($result->members[$ids[0]]->fixed->chargesPaisa)->toBe(70000)
        ->and(LedgerEntry::count())->toBe($before);
});

it('works outside a request with no mess context', function () {
    [$mess, , $month] = jSetup('member');
    jBill($mess, $month, jCategory($mess, ['name' => 'Wifi']), 90000);
    app(MessContext::class)->clear();

    $result = app(MonthBalanceService::class)->forMonth($month);

    expect(array_sum(array_map(fn ($m) => $m->totalPaisa, $result->members)))->toBe(-90000);
});
