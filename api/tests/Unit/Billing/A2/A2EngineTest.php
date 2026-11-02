<?php

use App\Billing\Balance\BalanceCalculator;
use App\Billing\Balance\CloseCheck;
use App\Billing\Split\LargestRemainder;
use App\Billing\DoesntPay\Redistributor;
use App\Billing\DoesntPay\RepaymentAllocator;
use App\Billing\Dto\CloseCheckInput;
use App\Billing\Dto\DoesntPayRequest;
use App\Enums\DoesntPayMode;

require_once __DIR__.'/../Gate/GateHelpers.php';

function a2Totals($r): array
{
    return array_map(fn ($m) => $m->totalPaisa, $r->members);
}

it('internal largest remainder: CONTRACT 4.1 example, ties, negatives, errors', function () {
    expect(LargestRemainder::split(800000, [1 => 60, 2 => 50, 3 => 40, 4 => 20]))->toBe([1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118])
        ->and(LargestRemainder::split(100, [5 => 1, 2 => 1, 9 => 1]))->toBe([5 => 34, 2 => 33, 9 => 33]) // tie -> earlier key
        ->and(LargestRemainder::split(-100, [1 => 1, 2 => 1, 3 => 1]))->toBe([1 => -34, 2 => -33, 3 => -33])
        ->and(LargestRemainder::split(0, [1 => 0, 2 => 0]))->toBe([1 => 0, 2 => 0])
        ->and(LargestRemainder::split(0, []))->toBe([])
        ->and(fn () => LargestRemainder::split(5, [1 => 0, 2 => 0]))->toThrow(InvalidArgumentException::class);
});

it('Redistributor equal / by_meals / manual', function () {
    $e = Redistributor::split(210066, DoesntPayMode::Equal, [1, 2], [], []);
    expect($e->shares)->toBe([1 => 105033, 2 => 105033])->and($e->mismatchPaisa)->toBe(0)->and($e->amountPaisa)->toBe(210066);

    $odd = Redistributor::split(100, DoesntPayMode::Equal, [1, 2, 3], [], []);
    expect($odd->shares)->toBe([1 => 34, 2 => 33, 3 => 33]);

    $m = Redistributor::split(1000, DoesntPayMode::ByMeals, [1, 2], [1 => 100, 2 => 300, 3 => 999], []);
    expect($m->shares)->toBe([1 => 250, 2 => 750]);

    $zero = Redistributor::split(1000, DoesntPayMode::ByMeals, [1, 2], [1 => 0, 2 => 0], []);
    expect($zero->shares)->toBe([1 => 500, 2 => 500]);

    $man = Redistributor::split(1000, DoesntPayMode::Manual, [1, 2], [], [1 => 300, 2 => 600]);
    expect($man->shares)->toBe([1 => 300, 2 => 600])->and($man->mismatchPaisa)->toBe(100);
    $over = Redistributor::split(1000, DoesntPayMode::Manual, [1, 2], [], [1 => 600, 2 => 600]);
    expect($over->mismatchPaisa)->toBe(-200);
});

it('RepaymentAllocator rounds with largest remainder and is exact', function () {
    expect(RepaymentAllocator::allocate(1, [1 => 1, 2 => 1, 3 => 1]))->toBe([1 => 1, 2 => 0, 3 => 0])
        ->and(array_sum(RepaymentAllocator::allocate(99999, [1 => 7, 2 => 11, 3 => 13])))->toBe(99999)
        ->and(RepaymentAllocator::allocate(0, [1 => 5, 2 => 5]))->toBe([1 => 0, 2 => 0]);
});

it('by_meals doesnt-pay inside the balance, falling back to equal when all weights zero', function () {
    $ids = [1, 2, 3];
    $base = [
        'charges' => gateGroups($ids, meals: [1 => 0, 2 => 0, 3 => 90000]),
        'doesntPay' => [new DoesntPayRequest(3, DoesntPayMode::ByMeals, [])],
    ];
    $w = BalanceCalculator::calculate(gateBalanceInput($ids, $base + ['mealWeights' => [1 => 100, 2 => 200, 3 => 50]]));
    expect($w->doesntPay[0]->shares)->toBe([1 => 30000, 2 => 60000])->and(a2Totals($w))->toBe([1 => -30000, 2 => -60000, 3 => 0]);

    $z = BalanceCalculator::calculate(gateBalanceInput($ids, $base));
    expect($z->doesntPay[0]->shares)->toBe([1 => 45000, 2 => 45000]);
});

it('doesnt-pay uses total across groups incl. carry-in, ignores non-debtors and positive totals', function () {
    $ids = [1, 2, 3];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'carryIn' => [3 => -10000],
        'charges' => gateGroups($ids, fixed: [3 => 30000], meals: [3 => 10000]),
        'ownPocket' => gateGroups($ids, meals: [3 => 20000]),
        'doesntPay' => [new DoesntPayRequest(3, DoesntPayMode::Equal, []), new DoesntPayRequest(1, DoesntPayMode::Equal, [])],
    ]));
    // member 3: -10000 -30000 -10000 +20000 = -30000 ; member 1 total 0 -> no-op split of 0
    expect($r->doesntPay[0]->amountPaisa)->toBe(30000)
        ->and($r->doesntPay[0]->shares)->toBe([2 => 30000]) // only non-debtor active member (1 is also a debtor)
        ->and($r->doesntPay[1]->amountPaisa)->toBe(0)
        ->and(a2Totals($r))->toBe([1 => 0, 2 => -30000, 3 => 0]);
});

it('doesnt-pay only charges active members', function () {
    $r = BalanceCalculator::calculate(gateBalanceInput([1, 2, 3, 4], [
        'activeMemberIds' => [1, 2, 3],
        'charges' => gateGroups([1, 2, 3, 4], meals: [3 => 1000]),
        'doesntPay' => [new DoesntPayRequest(3, DoesntPayMode::Equal, [])],
    ]));
    expect($r->doesntPay[0]->shares)->toBe([1 => 500, 2 => 500])->and($r->members[4]->totalPaisa)->toBe(0);
});

it('debtor with no other active members leaves the whole amount as mismatch', function () {
    $r = BalanceCalculator::calculate(gateBalanceInput([1], [
        'charges' => gateGroups([1], meals: [1 => 700]),
        'doesntPay' => [new DoesntPayRequest(1, DoesntPayMode::Equal, [])],
    ]));
    expect($r->doesntPay[0]->shares)->toBe([])->and($r->doesntPay[0]->mismatchPaisa)->toBe(700);
});

it('cross-group: meals credit does NOT offset fixed due; positive fixed credit offsets deposit', function () {
    $ids = [1, 2];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'charges' => gateGroups($ids, fixed: [1 => 100000, 2 => 100000]),
        'payments' => gateGroups($ids, fixed: [2 => 150000]),
        'ownPocket' => gateGroups($ids, meals: [1 => 250000]),
        'depositRequired' => [1 => 100000, 2 => 100000],
    ]));
    // m1: fixed -100000, meals +250000 -> outstanding stays the full fixed due
    expect($r->members[1]->fixedOutstandingPaisa)->toBe(100000)
        // m2: fixed +50000 (credit) -> deposit outstanding 100000-50000
        ->and($r->members[2]->fixed->balancePaisa)->toBe(50000)
        ->and($r->members[2]->depositOutstandingPaisa)->toBe(50000)
        // a meals DEBT does not net against fixed credit for outstanding
        ->and($r->members[1]->depositOutstandingPaisa)->toBe(0);

    $d = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'charges' => gateGroups($ids, fixed: [1 => 50000], meals: [1 => 90000]),
        'payments' => gateGroups($ids, fixed: [1 => 100000]),
    ]));
    // fixed +50000, meals -90000: fixed outstanding 0 (fixed itself is credit)
    expect($d->members[1]->fixedOutstandingPaisa)->toBe(0)->and($d->members[1]->totalPaisa)->toBe(-40000);
});

it('overdue: none without deadline, none on deadline day, none when settled, counts days across months', function () {
    $ids = [1];
    $mk = fn (array $o) => BalanceCalculator::calculate(gateBalanceInput($ids, $o + ['charges' => gateGroups($ids, fixed: [1 => 1000]), 'depositRequired' => [1 => 500]]))->members[1];

    expect($mk(['today' => '2026-11-30'])->fixedOverdueDays)->toBe(0)
        ->and($mk(['fixedDeadline' => '2026-11-10', 'today' => '2026-11-10'])->fixedOverdueDays)->toBe(0)
        ->and($mk(['fixedDeadline' => '2026-11-10', 'today' => '2026-11-11'])->fixedOverdueDays)->toBe(1)
        ->and($mk(['fixedDeadline' => '2026-10-28', 'today' => '2026-11-02'])->fixedOverdueDays)->toBe(5)
        ->and($mk(['depositDeadline' => '2026-11-01', 'today' => '2026-11-02'])->depositOverdueDays)->toBe(1);

    $paid = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'charges' => gateGroups($ids, fixed: [1 => 1000]),
        'payments' => gateGroups($ids, fixed: [1 => 1000]),
        'fixedDeadline' => '2026-11-01',
        'today' => '2026-11-20',
    ]))->members[1];
    expect($paid->fixedOverdueDays)->toBe(0)->and($paid->fixedOutstandingPaisa)->toBe(0);
});

it('partial payments reduce outstanding on the fixed side (carry-in is part of the fixed due)', function () {
    $ids = [1];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'carryIn' => [1 => -50000],
        'charges' => gateGroups($ids, fixed: [1 => 100000]),
        'payments' => gateGroups($ids, fixed: [1 => 120000]),
        'fixedDeadline' => '2026-11-05',
        'today' => '2026-11-08',
    ]))->members[1];
    expect($r->fixedOutstandingPaisa)->toBe(30000)->and($r->fixedOverdueDays)->toBe(3);
});

it('ledger adjustments count in their own group; meals ledger counts toward deposit', function () {
    $ids = [1];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'ledger' => gateGroups($ids, fixed: [1 => -2000], meals: [1 => 3000]),
        'depositRequired' => [1 => 5000],
    ]))->members[1];
    expect($r->fixed->balancePaisa)->toBe(-2000)->and($r->meals->balancePaisa)->toBe(3000)
        ->and($r->fixedOutstandingPaisa)->toBe(2000)->and($r->depositOutstandingPaisa)->toBe(2000);
});

it('Excel October: manual doesnt-pay matching exactly has no mismatch', function () {
    $ids = [1, 2, 3];
    $r = BalanceCalculator::calculate(gateBalanceInput($ids, [
        'ownPocket' => gateGroups($ids, meals: [1 => 345000, 2 => 837200, 3 => 276000]),
        'charges' => gateGroups($ids, meals: [1 => 486067, 2 => 486067, 3 => 486066]),
        'doesntPay' => [new DoesntPayRequest(3, DoesntPayMode::Manual, [1 => 110066, 2 => 100000])],
    ]));
    expect($r->doesntPay[0]->mismatchPaisa)->toBe(0)->and(a2Totals($r))->toBe([1 => -251133, 2 => 251133, 3 => 0]);
});

it('CloseCheck: PROJECT §7 example 1 identity with doesnt-pay and rounding', function () {
    $mk = fn (array $o) => CloseCheck::verify(new CloseCheckInput(...array_replace([
        'cashPaisa' => 0, 'sumBalancesPaisa' => 0, 'fixedBillsPaisa' => 0, 'fixedExpensesPaisa' => 0,
        'unallocatedPaisa' => 0, 'roundingDeltaPaisa' => 0, 'openingPaisa' => 0, 'adjustmentsPaisa' => 0,
        'unchargedFoodPaisa' => 0, 'doesntPayNetPaisa' => 0,
    ], $o)));

    // whole-taka example: Σ balances = cash − Σ rounding delta ... delta negative: charged less than exact
    expect($mk(['cashPaisa' => 1000000, 'sumBalancesPaisa' => 500000 + 1, 'roundingDeltaPaisa' => -1, 'fixedBillsPaisa' => 0])->actualPaisa)->toBe(499999)
        ->and($mk(['cashPaisa' => 100, 'sumBalancesPaisa' => 50, 'unchargedFoodPaisa' => -5, 'fixedExpensesPaisa' => 5])->ok)->toBeFalse()
        ->and($mk(['cashPaisa' => 100, 'sumBalancesPaisa' => 50, 'unchargedFoodPaisa' => 0, 'fixedExpensesPaisa' => -50])->ok)->toBeTrue()
        ->and($mk(['cashPaisa' => 10, 'sumBalancesPaisa' => 0, 'unchargedFoodPaisa' => 4])->differencePaisa)->toBe(14);
});

it('repayment credit-back round trip reverses a doesnt-pay split to the paisa', function () {
    $split = Redistributor::split(210066, DoesntPayMode::Equal, [1, 2], [], []);
    expect(RepaymentAllocator::allocate(210066, $split->shares))->toBe($split->shares);
});
