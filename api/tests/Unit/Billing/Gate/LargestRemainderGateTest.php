<?php

use App\Billing\Split\LargestRemainder;

it('splits PROJECT §7 example 1 food cost exactly', function () {
    // 8,000 taka by effective meals 60/50/40/20 (D raised to the minimum 20)
    expect(LargestRemainder::split(800000, [1 => 6000, 2 => 5000, 3 => 4000, 4 => 2000]))
        ->toBe([1 => 282353, 2 => 235294, 3 => 188235, 4 => 94118]);
});

it('breaks equal-fraction ties by key order (lowest member id first)', function () {
    expect(LargestRemainder::split(100, [1 => 1, 2 => 1, 3 => 1]))->toBe([1 => 34, 2 => 33, 3 => 33])
        ->and(LargestRemainder::split(1458200, [1 => 1, 2 => 1, 3 => 1]))->toBe([1 => 486067, 2 => 486067, 3 => 486066]);
});

it('splits a negative total by splitting the absolute value and negating', function () {
    expect(LargestRemainder::split(-100, [1 => 1, 2 => 1, 3 => 1]))->toBe([1 => -34, 2 => -33, 3 => -33]);
});

it('gives zero to zero weights and keeps the sum', function () {
    expect(LargestRemainder::split(1000, [1 => 0, 2 => 3, 3 => 1]))->toBe([1 => 0, 2 => 750, 3 => 250]);
});

it('rejects all-zero weights with a non-zero total', function () {
    LargestRemainder::split(100, [1 => 0, 2 => 0]);
})->throws(InvalidArgumentException::class);
