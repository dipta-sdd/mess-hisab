<?php

use App\Billing\Balance\CloseCheck;
use App\Billing\DoesntPay\RepaymentAllocator;
use App\Billing\Dto\CloseCheckInput;

function closeInput(array $o): CloseCheckInput
{
    return new CloseCheckInput(...array_replace([
        'cashPaisa' => 0, 'sumBalancesPaisa' => 0, 'fixedBillsPaisa' => 0, 'fixedExpensesPaisa' => 0,
        'unallocatedPaisa' => 0, 'roundingDeltaPaisa' => 0, 'openingPaisa' => 0, 'adjustmentsPaisa' => 0,
        'unchargedFoodPaisa' => 0, 'doesntPayNetPaisa' => 0,
    ], $o));
}

it('passes PROJECT §7 example 1 (cash 5000, balances 5000)', function () {
    $r = CloseCheck::verify(closeInput(['cashPaisa' => 500000, 'sumBalancesPaisa' => 500000]));

    expect($r->ok)->toBeTrue()->and($r->actualPaisa)->toBe(0)->and($r->expectedPaisa)->toBe(0)->and($r->differencePaisa)->toBe(0);
});

it('passes PROJECT §7 example 2 (fixed money not yet spent)', function () {
    $r = CloseCheck::verify(closeInput(['cashPaisa' => 0, 'sumBalancesPaisa' => -840000, 'fixedBillsPaisa' => 840000]));

    expect($r->ok)->toBeTrue()->and($r->actualPaisa)->toBe(840000)->and($r->expectedPaisa)->toBe(840000);
});

it('counts the round-up extra as cash the mess holds', function () {
    // fixed bill 156345 charged 52200 x 3 = 156600, nobody paid yet
    $r = CloseCheck::verify(closeInput(['sumBalancesPaisa' => -156600, 'fixedBillsPaisa' => 156345, 'roundingDeltaPaisa' => 255]));

    expect($r->ok)->toBeTrue();
});

it('subtracts opening balances, adjustments, uncharged food, unallocated and doesnt-pay rows', function () {
    $r = CloseCheck::verify(closeInput([
        'cashPaisa' => 1000, 'sumBalancesPaisa' => 1000 - (500 - 30 - 20 - 10 - 7 - 3 - 2),
        'fixedBillsPaisa' => 500, 'unallocatedPaisa' => 30, 'openingPaisa' => 20, 'adjustmentsPaisa' => 10,
        'unchargedFoodPaisa' => 7, 'doesntPayNetPaisa' => 3, 'fixedExpensesPaisa' => 2,
    ]));

    expect($r->ok)->toBeTrue()->and($r->expectedPaisa)->toBe(428);
});

it('fails with the exact difference when cash does not match', function () {
    $r = CloseCheck::verify(closeInput(['cashPaisa' => 499900, 'sumBalancesPaisa' => 500000]));

    expect($r->ok)->toBeFalse()->and($r->actualPaisa)->toBe(-100)->and($r->differencePaisa)->toBe(-100);
});

it('credits a later repayment back by the saved shares', function () {
    expect(RepaymentAllocator::allocate(100000, [1 => 105033, 2 => 105033]))->toBe([1 => 50000, 2 => 50000])
        ->and(RepaymentAllocator::allocate(101, [1 => 105033, 2 => 105033]))->toBe([1 => 51, 2 => 50])
        ->and(RepaymentAllocator::allocate(1000, [1 => 1, 2 => 3]))->toBe([1 => 250, 2 => 750]);
});
