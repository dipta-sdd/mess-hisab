<?php

use App\Rules\BdMobile;

it('normalises the usual ways of typing a number', function (string $typed) {
    expect(BdMobile::normalize($typed))->toBe('01712345678')
        ->and(BdMobile::isValid($typed))->toBeTrue();
})->with(['01712345678', '+8801712345678', '8801712345678', '1712345678', '017-1234 5678', '+880 1712-345678']);

it('rejects what is not a Bangladesh mobile', function (?string $typed) {
    expect(BdMobile::isValid($typed))->toBeFalse();
})->with(['', null, '0171234567', '017123456789', '01212345678', '02712345678', 'abc']);
