<?php

use App\Models\Category;
use App\Models\MonthBill;
use App\Services\Sms\FakeSender;
use App\Services\Sms\SmsSender;

require_once __DIR__.'/LifecycleHelpers.php';

function cbUrl($mess, $month, string $tail): string
{
    return "/api/messes/{$mess->id}/months/{$month->id}/$tail";
}

function cbRent($mess): Category
{
    return Category::where('mess_id', $mess->id)->where('name', 'Rent')->firstOrFail();
}

beforeEach(function () {
    app()->instance(SmsSender::class, new FakeSender);
});

it('saves bill edits and a new fixed bill together with the close', function () {
    [$mess, $me, $month, $ids] = kScenario();
    $rent = cbRent($mess);

    $this->postJson(cbUrl($mess, $month, 'close'), ['bills' => [
        ['category_id' => $rent->id, 'amount_paisa' => 450000],
        ['name' => 'Gas', 'split_type' => 'equal', 'amount_paisa' => 90000],
    ]])->assertOk();

    expect(MonthBill::where('month_id', $month->id)->where('category_id', $rent->id)->value('amount_paisa'))->toBe(450000);
    $gas = Category::where('mess_id', $mess->id)->where('name', 'Gas')->first();
    expect($gas)->not->toBeNull()->and($gas->group->value)->toBe('fixed')->and($gas->is_default)->toBeFalse();
    expect(MonthBill::where('month_id', $month->id)->where('category_id', $gas->id)->value('amount_paisa'))->toBe(90000);
});

it('keeps nothing when the close is refused', function () {
    [$mess, $me, $month, $ids] = kScenario();
    $rent = cbRent($mess);
    $this->postJson(cbUrl($mess, $month, 'close'))->assertOk();
    $this->postJson(cbUrl($mess, $month, 'reopen'))->assertOk();
    $before = MonthBill::where('month_id', $month->id)->where('category_id', $rent->id)->value('amount_paisa');

    // an unknown member in an override fails the whole call
    $this->postJson(cbUrl($mess, $month, 'close'), ['bills' => [
        ['name' => 'Gas', 'split_type' => 'equal', 'amount_paisa' => 90000],
        ['category_id' => $rent->id, 'amount_paisa' => 1, 'overrides' => [['member_id' => 999999, 'amount_paisa' => 5]]],
    ]])->assertStatus(409);

    expect(Category::where('mess_id', $mess->id)->where('name', 'Gas')->exists())->toBeFalse();
    expect(MonthBill::where('month_id', $month->id)->where('category_id', $rent->id)->value('amount_paisa'))->toBe($before);
    expect($month->refresh()->status->value)->toBe('open');
});

it('rejects a duplicate bill name and a by-meal new bill', function () {
    [$mess, $me, $month] = kScenario();

    $this->postJson(cbUrl($mess, $month, 'close'), ['bills' => [['name' => 'rent', 'split_type' => 'equal']]])->assertStatus(409);
    $this->postJson(cbUrl($mess, $month, 'close'), ['bills' => [['name' => 'Gas', 'split_type' => 'by_meal']]])->assertStatus(422);
    expect($month->refresh()->status->value)->toBe('open');
});

it('previews balances with the edits and saves nothing', function () {
    [$mess, $me, $month, $ids] = kScenario();
    $rent = cbRent($mess);
    $plain = $this->postJson(cbUrl($mess, $month, 'close-preview'), [])->assertOk()->json('data');
    $edited = $this->postJson(cbUrl($mess, $month, 'close-preview'), ['bills' => [
        ['category_id' => $rent->id, 'amount_paisa' => 600000],
        ['name' => 'Gas', 'split_type' => 'equal', 'amount_paisa' => 30000],
    ]])->assertOk()->json('data');

    expect($edited)->toHaveKeys(['can_close', 'blocks', 'balances']);
    $of = fn (array $d) => collect($d['balances'])->firstWhere('member_id', $ids[0])['balance_paisa'];
    $a = $of($plain);
    $b = $of($edited);
    expect($b)->toBeLessThan($a);

    expect(Category::where('mess_id', $mess->id)->where('name', 'Gas')->exists())->toBeFalse();
    expect(MonthBill::where('month_id', $month->id)->where('category_id', $rent->id)->value('amount_paisa'))->toBe(300000);
    expect($month->refresh()->status->value)->toBe('open');
});

it('only lets the manager close or preview with edits', function () {
    [$mess, $me, $month] = kScenario('member');

    $this->postJson(cbUrl($mess, $month, 'close-preview'), [])->assertForbidden();
    $this->postJson(cbUrl($mess, $month, 'close'), ['bills' => [['name' => 'Gas', 'split_type' => 'equal']]])->assertForbidden();
});
