<?php

use App\Billing\Balance\BalanceCalculator;
use App\Billing\Dto\DoesntPayRequest;
use App\Enums\DoesntPayMode;

require_once __DIR__.'/GateHelpers.php';

it('balances PROJECT §7 example 1 (deposits, own-pocket, meal charges)', function () {
    $ids = [1, 2, 3, 4];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'payments' => gateGroups($ids, meals: [1 => 250000, 2 => 250000, 3 => 250000, 4 => 250000]),
        'ownPocket' => gateGroups($ids, meals: [1 => 300000]),
        'charges' => gateGroups($ids, meals: [1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118]),
        'depositRequired' => [1 => 250000, 2 => 250000, 3 => 250000, 4 => 300000],
        'depositDeadline' => '2026-11-05',
    ]));

    expect(array_map(fn ($m) => $m->totalPaisa, $r->members))->toBe([1 => 267647, 2 => 14706, 3 => 61765, 4 => 155882])
        ->and($r->members[1]->meals->ownPocketPaisa)->toBe(300000)
        ->and($r->members[1]->meals->balancePaisa)->toBe(267647)
        ->and($r->members[1]->fixed->balancePaisa)->toBe(0)
        ->and($r->members[4]->depositOutstandingPaisa)->toBe(50000)
        ->and($r->members[4]->depositOverdueDays)->toBe(0) // deadline not passed yet
        ->and($r->members[1]->depositOutstandingPaisa)->toBe(0)
        ->and($r->doesntPay)->toBe([]);
});

it('nets groups and counts overdue days for PROJECT §7 example 2', function () {
    $ids = [1, 2, 3]; // X, Y, Z
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'payments' => gateGroups($ids, meals: [3 => 50000]),
        'ownPocket' => gateGroups($ids, meals: [1 => 150000]),
        'charges' => gateGroups($ids, fixed: [1 => 230000, 2 => 380000, 3 => 230000], meals: [1 => 80000, 2 => 40000, 3 => 80000]),
        'depositRequired' => [1 => 100000, 2 => 100000, 3 => 100000],
        'fixedDeadline' => '2026-11-10',
        'depositDeadline' => '2026-11-05',
        'today' => '2026-11-15',
    ]));

    $x = $r->members[1];
    expect($x->fixed->balancePaisa)->toBe(-230000)
        ->and($x->meals->balancePaisa)->toBe(70000)
        ->and($x->totalPaisa)->toBe(-160000)
        ->and($x->fixedOutstandingPaisa)->toBe(160000)
        ->and($x->fixedOverdueDays)->toBe(5)
        ->and($x->depositOutstandingPaisa)->toBe(0)
        ->and($x->depositOverdueDays)->toBe(0)
        ->and($r->members[2]->fixedOutstandingPaisa)->toBe(380000)
        ->and($r->members[2]->depositOutstandingPaisa)->toBe(100000)
        ->and($r->members[2]->depositOverdueDays)->toBe(10)
        ->and($r->members[3]->totalPaisa)->toBe(-260000)
        ->and($r->members[3]->depositOutstandingPaisa)->toBe(50000);
});

it('shows carry-in on the fixed side as part of the fixed balance', function () {
    $ids = [1, 2];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'carryIn' => [1 => -40000, 2 => 70000],
        'charges' => gateGroups($ids, fixed: [1 => 100000, 2 => 100000]),
    ]));

    expect($r->members[1]->fixed->carryInPaisa)->toBe(-40000)
        ->and($r->members[1]->fixed->balancePaisa)->toBe(-140000)
        ->and($r->members[1]->meals->carryInPaisa)->toBe(0)
        ->and($r->members[2]->fixed->balancePaisa)->toBe(-30000);
});

it('redistributes Excel October: Nilu does not pay, split equally', function () {
    $ids = [1, 2, 3]; // Shuvendu, Dipta, Nilu
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'ownPocket' => gateGroups($ids, meals: [1 => 345000, 2 => 837200, 3 => 276000]),
        'charges' => gateGroups($ids, meals: [1 => 486067, 2 => 486067, 3 => 486066]),
        'doesntPay' => [new DoesntPayRequest(3, DoesntPayMode::Equal, [])],
    ]));

    expect(array_map(fn ($m) => $m->totalPaisa, $r->members))->toBe([1 => -246100, 2 => 246100, 3 => 0])
        ->and($r->members[3]->fixed->doesntPayPaisa)->toBe(210066)
        ->and($r->members[1]->fixed->doesntPayPaisa)->toBe(-105033)
        ->and($r->members[1]->meals->doesntPayPaisa)->toBe(0)
        ->and($r->doesntPay)->toHaveCount(1)
        ->and($r->doesntPay[0]->debtorMemberId)->toBe(3)
        ->and($r->doesntPay[0]->amountPaisa)->toBe(210066)
        ->and($r->doesntPay[0]->shares)->toBe([1 => 105033, 2 => 105033])
        ->and($r->doesntPay[0]->mismatchPaisa)->toBe(0);
});

it('reports a manual doesnt-pay mismatch', function () {
    $ids = [1, 2, 3];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'ownPocket' => gateGroups($ids, meals: [1 => 345000, 2 => 837200, 3 => 276000]),
        'charges' => gateGroups($ids, meals: [1 => 486067, 2 => 486067, 3 => 486066]),
        'doesntPay' => [new DoesntPayRequest(3, DoesntPayMode::Manual, [1 => 100000, 2 => 100000])],
    ]));

    expect($r->doesntPay[0]->mismatchPaisa)->toBe(10066)
        ->and($r->members[1]->fixed->doesntPayPaisa)->toBe(-100000)
        ->and($r->members[3]->fixed->doesntPayPaisa)->toBe(210066);
});

it('excludes every debtor from the others and uses each debtor total before any doesnt-pay', function () {
    $ids = [1, 2, 3, 4];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'charges' => gateGroups($ids, meals: [1 => 100, 2 => 200]),
        'doesntPay' => [
            new DoesntPayRequest(1, DoesntPayMode::Equal, []),
            new DoesntPayRequest(2, DoesntPayMode::Equal, []),
        ],
    ]));

    expect(array_map(fn ($m) => $m->totalPaisa, $r->members))->toBe([1 => 0, 2 => 0, 3 => -150, 4 => -150])
        ->and($r->doesntPay[0]->shares)->toBe([3 => 50, 4 => 50])
        ->and($r->doesntPay[1]->shares)->toBe([3 => 100, 4 => 100]);
});
