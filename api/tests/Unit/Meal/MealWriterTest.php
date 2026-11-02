<?php

use App\Models\Mess;
use App\Services\Meal\MealWriter;
use App\Services\Month\Calendar;

it('weights ticked meals with integer centi-meals', function (array $ticks, int $expected) {
    $mess = new Mess(['breakfast_weight_centi' => 50, 'lunch_weight_centi' => 100, 'dinner_weight_centi' => 125]);
    $writer = new MealWriter(new Calendar);

    expect($writer->weighted($mess, $ticks))->toBe($expected);
})->with([
    'none' => [['breakfast' => false, 'lunch' => false, 'dinner' => false], 0],
    'breakfast' => [['breakfast' => true, 'lunch' => false, 'dinner' => false], 50],
    'lunch+dinner' => [['breakfast' => false, 'lunch' => true, 'dinner' => true], 225],
    'all' => [['breakfast' => true, 'lunch' => true, 'dinner' => true], 275],
]);
