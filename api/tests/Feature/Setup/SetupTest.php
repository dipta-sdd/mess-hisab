<?php

use App\Enums\ExpenseStatus;
use App\Models\Category;
use App\Models\ChargeOverride;
use App\Models\Expense;
use App\Models\MemberMonthSetting;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\MonthBill;

/**
 * Month 2026-11-01..30 with three active members (ids ascending). When $role is 'manager' the acting user
 * is one of them. Returns [Mess, MessMember me, Month, int[] ids].
 */
function hSetup(string $role = 'manager', bool $closed = false): array
{
    [$mess, $me] = actingAsMember($role);
    $month = Month::factory()->create(['mess_id' => $mess->id, 'status' => $closed ? 'closed' : 'open']);
    while (MessMember::forMess($mess->id)->count() < 3) {
        MessMember::factory()->for($mess)->create();
    }
    $ids = MessMember::forMess($mess->id)->orderBy('id')->pluck('id')->all();

    return [$mess, $me, $month, $ids];
}

function hCategory(Mess $mess, array $attrs = []): Category
{
    return Category::factory()->create(['mess_id' => $mess->id] + $attrs);
}

function hBillPath(Mess $mess, Month $month, Category $cat, string $suffix = ''): string
{
    return messPath($mess, "months/{$month->id}/bills/{$cat->id}".$suffix);
}

// ---------------------------------------------------------------- GET setup

it('shows the setup to any member with shares from the engine', function () {
    [$mess, , $month, $ids] = hSetup('manager');
    [$x, $y, $z] = $ids;

    // CONTRACT §4.5: bill 90000, Z pinned at 10000, X and Y split 80000.
    $wifi = hCategory($mess, ['name' => 'Wifi', 'sort' => 1]);
    MonthBill::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $wifi->id, 'amount_paisa' => 90000]);
    ChargeOverride::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $wifi->id, 'member_id' => $z, 'amount_paisa' => 10000]);

    // fixed_per_person: 2000 / 3500 / 2000 of an 8000 bill -> 500 unallocated.
    $rent = hCategory($mess, ['name' => 'Rent', 'split_type' => 'fixed_per_person', 'sort' => 2]);
    MonthBill::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $rent->id, 'amount_paisa' => 800000]);
    foreach ([$x => 200000, $y => 350000, $z => 200000] as $m => $p) {
        ChargeOverride::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $rent->id, 'member_id' => $m, 'amount_paisa' => $p]);
    }

    // Meals: an equal category (total = approved, undeleted expenses only) and a by_meal one.
    $tea = hCategory($mess, ['name' => 'Tea', 'group' => 'meals', 'split_type' => 'equal', 'sort' => 3]);
    $bazar = hCategory($mess, ['name' => 'Bazar', 'group' => 'meals', 'split_type' => 'by_meal', 'sort' => 4]);
    $base = ['mess_id' => $mess->id, 'month_id' => $month->id, 'created_by_member_id' => $x, 'paid_by_member_id' => $x];
    Expense::factory()->create($base + ['category_id' => $tea->id, 'amount_paisa' => 10000]);
    Expense::factory()->create($base + ['category_id' => $tea->id, 'amount_paisa' => 5000]);
    Expense::factory()->create($base + ['category_id' => $tea->id, 'amount_paisa' => 7777, 'status' => ExpenseStatus::Pending]);
    Expense::factory()->create($base + ['category_id' => $tea->id, 'amount_paisa' => 9999])->delete();
    Expense::factory()->create($base + ['category_id' => $bazar->id, 'amount_paisa' => 123400]);

    hCategory($mess, ['name' => 'Old', 'sort' => 5, 'archived_at' => now()]);
    $foreign = otherMess();
    hCategory($foreign, ['name' => 'Foreign']);

    MemberMonthSetting::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $y, 'deposit_paisa' => 100000, 'min_meals_centi' => null]);

    $res = $this->getJson(messPath($mess, "months/{$month->id}/setup"))->assertOk();
    $data = $res->json('data');

    expectContractShape($data['month'], 'Month');
    expect(array_keys($data))->toBe(['month', 'bills', 'member_settings']);
    expect($data['bills'])->toHaveCount(4); // archived and foreign categories absent
    foreach ($data['bills'] as $bill) {
        expectContractShape($bill, 'Bill');
    }
    foreach ($data['member_settings'] as $s) {
        expectContractShape($s, 'MemberMonthSetting');
    }

    [$b1, $b2, $b3, $b4] = $data['bills'];
    expect($b1['category_id'])->toBe($wifi->id)
        ->and($b1['amount_paisa'])->toBe(90000)
        ->and($b1['overrides'])->toBe([['member_id' => $z, 'amount_paisa' => 10000]])
        ->and($b1['shares'])->toBe([$x => 40000, $y => 40000, $z => 10000])
        ->and($b1['unallocated_paisa'])->toBe(0);

    expect($b2['split_type'])->toBe('fixed_per_person')
        ->and($b2['shares'])->toBe([$x => 200000, $y => 350000, $z => 200000])
        ->and($b2['unallocated_paisa'])->toBe(50000);

    expect($b3['group'])->toBe('meals')
        ->and($b3['amount_paisa'])->toBe(15000)
        ->and($b3['shares'])->toBe([$x => 5000, $y => 5000, $z => 5000]);

    // by_meal: the meal engine (task J) computes it; here only the total.
    expect($b4['split_type'])->toBe('by_meal')
        ->and($b4['amount_paisa'])->toBe(123400)
        ->and($res->json('data.bills.3.shares'))->toBe([])
        ->and($b4['unallocated_paisa'])->toBe(0);

    expect($data['member_settings'])->toBe([['member_id' => $y, 'deposit_paisa' => 100000, 'min_meals_centi' => null]]);
});

it('shows an unset fixed bill as zero and ignores members who were not active in the month', function () {
    [$mess, , $month, $ids] = hSetup('manager');
    MessMember::forMess($mess->id)->whereKey($ids[2])->update(['joined_on' => '2026-12-05']); // joins after the month
    hCategory($mess);

    $bill = $this->getJson(messPath($mess, "months/{$month->id}/setup"))->assertOk()->json('data.bills.0');

    expect($bill['amount_paisa'])->toBe(0)
        ->and($bill['shares'])->toBe([$ids[0] => 0, $ids[1] => 0]);
});

it('hides another mess month with 404', function () {
    [$mess] = hSetup('manager');
    $foreign = otherMess();
    $theirs = Month::factory()->create(['mess_id' => $foreign->id]);

    $this->getJson(messPath($mess, "months/{$theirs->id}/setup"))->assertNotFound();
});

// ---------------------------------------------------------------- PATCH setup

it('sets deadlines and the default deposit', function () {
    [$mess, , $month] = hSetup();

    $res = $this->patchJson(messPath($mess, "months/{$month->id}/setup"), [
        'fixed_deadline' => '2026-11-05', 'deposit_deadline' => '2026-12-03', 'deposit_paisa' => 250000,
    ])->assertOk();

    expectContractShape($res->json('data'), 'Month');
    expect($res->json('data'))->toMatchArray(['fixed_deadline' => '2026-11-05', 'deposit_deadline' => '2026-12-03', 'deposit_paisa' => 250000]);

    // Only sent keys change; null clears a deadline.
    $res = $this->patchJson(messPath($mess, "months/{$month->id}/setup"), ['fixed_deadline' => null])->assertOk();
    expect($res->json('data'))->toMatchArray(['fixed_deadline' => null, 'deposit_deadline' => '2026-12-03', 'deposit_paisa' => 250000]);
});

it('validates the setup payload', function (array $bad) {
    [$mess, , $month] = hSetup();

    $this->patchJson(messPath($mess, "months/{$month->id}/setup"), $bad)->assertUnprocessable();
})->with([
    'empty body' => [[]],
    'deadline before the month' => [['fixed_deadline' => '2026-10-31']],
    'deadline absurdly late' => [['deposit_deadline' => '2062-01-01']],
    'bad date format' => [['fixed_deadline' => '05/11/2026']],
    'negative deposit' => [['deposit_paisa' => -1]],
    'float deposit' => [['deposit_paisa' => 10.5]],
    'string deposit' => [['deposit_paisa' => '25.5']],
]);

it('allows a deadline in the month after', function () {
    [$mess, , $month] = hSetup();

    $this->patchJson(messPath($mess, "months/{$month->id}/setup"), ['deposit_deadline' => '2026-12-31'])->assertOk();
});

// ---------------------------------------------------------------- PUT bill

it('sets a fixed bill amount and overrides (equal with override, CONTRACT 4.5)', function () {
    [$mess, , $month, $ids] = hSetup();
    [$x, $y, $z] = $ids;
    $wifi = hCategory($mess);

    $res = $this->putJson(hBillPath($mess, $month, $wifi), [
        'amount_paisa' => 90000, 'overrides' => [['member_id' => $z, 'amount_paisa' => 10000]],
    ])->assertOk();

    expectContractShape($res->json('data'), 'Bill');
    expect($res->json('data'))->toMatchArray([
        'category_id' => $wifi->id, 'group' => 'fixed', 'split_type' => 'equal', 'amount_paisa' => 90000,
        'overrides' => [['member_id' => $z, 'amount_paisa' => 10000]],
        'shares' => [$x => 40000, $y => 40000, $z => 10000],
        'unallocated_paisa' => 0, 'unallocated_accepted' => false,
    ]);
    expect(MonthBill::where('month_id', $month->id)->count())->toBe(1);
});

it('replaces the override set and resets the accepted flag', function () {
    [$mess, , $month, $ids] = hSetup();
    [$x, $y, $z] = $ids;
    $wifi = hCategory($mess);
    MonthBill::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $wifi->id, 'amount_paisa' => 90000, 'unallocated_accepted' => true]);
    foreach ([$x => 1000, $y => 2000] as $m => $p) {
        ChargeOverride::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $wifi->id, 'member_id' => $m, 'amount_paisa' => $p]);
    }

    $res = $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [
        ['member_id' => $y, 'amount_paisa' => 3000], ['member_id' => $z, 'amount_paisa' => 0],
    ]])->assertOk();

    expect($res->json('data.overrides'))->toBe([['member_id' => $y, 'amount_paisa' => 3000], ['member_id' => $z, 'amount_paisa' => 0]])
        ->and($res->json('data.amount_paisa'))->toBe(90000) // amount untouched
        ->and($res->json('data.unallocated_accepted'))->toBeFalse();
    expect(ChargeOverride::where('month_id', $month->id)->count())->toBe(2);

    // Empty list clears them all.
    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => []])->assertOk()->assertJsonPath('data.overrides', []);
    expect(ChargeOverride::where('month_id', $month->id)->count())->toBe(0);
});

it('takes overrides on a meals equal category but refuses an amount there', function () {
    [$mess, , $month, $ids] = hSetup();
    $tea = hCategory($mess, ['group' => 'meals', 'split_type' => 'equal']);

    $this->putJson(hBillPath($mess, $month, $tea), ['amount_paisa' => 5000])
        ->assertUnprocessable()->assertJsonValidationErrors(['amount_paisa']);

    $res = $this->putJson(hBillPath($mess, $month, $tea), ['overrides' => [['member_id' => $ids[0], 'amount_paisa' => 100]]])->assertOk();
    expect($res->json('data.amount_paisa'))->toBe(0)->and($res->json('data.group'))->toBe('meals');
    expect(MonthBill::where('category_id', $tea->id)->first()->amount_paisa)->toBeNull();
});

it('refuses overrides on a by_meal category', function () {
    [$mess, , $month, $ids] = hSetup();
    $bazar = hCategory($mess, ['group' => 'meals', 'split_type' => 'by_meal']);

    $this->putJson(hBillPath($mess, $month, $bazar), ['overrides' => [['member_id' => $ids[0], 'amount_paisa' => 100]]])
        ->assertUnprocessable()->assertJsonValidationErrors(['overrides']);
});

it('validates the bill payload', function (array $bad, string $field) {
    [$mess, , $month, $ids] = hSetup();
    $wifi = hCategory($mess);
    $ok = ['amount_paisa' => 1000, 'overrides' => [['member_id' => $ids[0], 'amount_paisa' => 100]]];

    $this->putJson(hBillPath($mess, $month, $wifi), array_replace_recursive($ok, $bad))
        ->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'negative amount' => [['amount_paisa' => -1], 'amount_paisa'],
    'float amount' => [['amount_paisa' => 10.5], 'amount_paisa'],
    'negative override' => [['overrides' => [['amount_paisa' => -1]]], 'overrides.0.amount_paisa'],
    'float override' => [['overrides' => [['amount_paisa' => 1.5]]], 'overrides.0.amount_paisa'],
    'unknown member' => [['overrides' => [['member_id' => 99999999]]], 'overrides.0.member_id'],
    'overrides not a list' => [['overrides' => 'x'], 'overrides'],
]);

it('rejects duplicate override members and members not active in the month', function () {
    [$mess, , $month, $ids] = hSetup();
    $wifi = hCategory($mess);
    $left = MessMember::factory()->for($mess)->create(['joined_on' => '2026-01-01', 'left_on' => '2026-10-15']);

    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [
        ['member_id' => $ids[0], 'amount_paisa' => 1], ['member_id' => $ids[0], 'amount_paisa' => 2],
    ]])->assertUnprocessable()->assertJsonValidationErrors(['overrides.0.member_id']);

    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [['member_id' => $left->id, 'amount_paisa' => 1]]])
        ->assertUnprocessable()->assertJsonValidationErrors(['overrides.0.member_id']);

    $foreign = MessMember::factory()->for(otherMess())->create();
    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [['member_id' => $foreign->id, 'amount_paisa' => 1]]])
        ->assertUnprocessable();

    // A numeric string passes `integer`; it must still be checked against the month's members.
    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [['member_id' => (string) $foreign->id, 'amount_paisa' => 1]]])
        ->assertUnprocessable()->assertJsonValidationErrors(['overrides.0.member_id']);
    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [['member_id' => (string) $left->id, 'amount_paisa' => 1]]])
        ->assertUnprocessable()->assertJsonValidationErrors(['overrides.0.member_id']);
});

it('needs the amount before a fixed bill can be saved', function () {
    [$mess, , $month, $ids] = hSetup();
    $wifi = hCategory($mess);

    $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [['member_id' => $ids[0], 'amount_paisa' => 1]]])
        ->assertStatus(409)->assertJsonPath('code', 'amount_required');
    expect(ChargeOverride::count())->toBe(0);
});

it('refuses writes to an archived category', function () {
    [$mess, , $month] = hSetup();
    $old = hCategory($mess, ['archived_at' => now()]);

    $this->putJson(hBillPath($mess, $month, $old), ['amount_paisa' => 1])->assertStatus(409)->assertJsonPath('code', 'category_archived');
    $this->postJson(hBillPath($mess, $month, $old, '/accept'))->assertStatus(409)->assertJsonPath('code', 'category_archived');
});

// ---------------------------------------------------------------- spread

it('spreads over the members who have no amount (fixed_per_person)', function () {
    [$mess, , $month, $ids] = hSetup();
    [$x, $y, $z] = $ids;
    $rent = hCategory($mess, ['split_type' => 'fixed_per_person']);
    $this->putJson(hBillPath($mess, $month, $rent), ['amount_paisa' => 800000, 'overrides' => [
        ['member_id' => $x, 'amount_paisa' => 200000], ['member_id' => $y, 'amount_paisa' => 350000],
    ]])->assertOk()->assertJsonPath('data.unallocated_paisa', 250000);

    $res = $this->postJson(hBillPath($mess, $month, $rent, '/spread'))->assertOk();

    expectContractShape($res->json('data'), 'Bill');
    expect($res->json('data.shares'))->toBe([$x => 200000, $y => 350000, $z => 250000])
        ->and($res->json('data.unallocated_paisa'))->toBe(0);
});

it('spreads over everyone with largest remainder when every member has an amount', function () {
    [$mess, , $month, $ids] = hSetup();
    [$x, $y, $z] = $ids;
    $rent = hCategory($mess, ['split_type' => 'fixed_per_person']);
    $this->putJson(hBillPath($mess, $month, $rent), ['amount_paisa' => 800000, 'overrides' => [
        ['member_id' => $x, 'amount_paisa' => 200000], ['member_id' => $y, 'amount_paisa' => 350000], ['member_id' => $z, 'amount_paisa' => 200000],
    ]])->assertOk()->assertJsonPath('data.unallocated_paisa', 50000);
    $this->postJson(hBillPath($mess, $month, $rent, '/accept'))->assertOk()->assertJsonPath('data.unallocated_accepted', true);

    $res = $this->postJson(hBillPath($mess, $month, $rent, '/spread'))->assertOk();

    // 50000 / 3 = 16666 each, the 2 leftover paisa go to the lowest ids (tie on remainder).
    expect($res->json('data.shares'))->toBe([$x => 216667, $y => 366667, $z => 216666])
        ->and($res->json('data.unallocated_paisa'))->toBe(0)
        ->and($res->json('data.unallocated_accepted'))->toBeFalse();
    expect(array_sum($res->json('data.shares')))->toBe(800000);
});

it('spreads an equal bill whose every member is overridden', function () {
    [$mess, , $month, $ids] = hSetup();
    [$x, $y, $z] = $ids;
    $wifi = hCategory($mess);
    $this->putJson(hBillPath($mess, $month, $wifi), ['amount_paisa' => 100000, 'overrides' => [
        ['member_id' => $x, 'amount_paisa' => 20000], ['member_id' => $y, 'amount_paisa' => 30000], ['member_id' => $z, 'amount_paisa' => 40000],
    ]])->assertOk()->assertJsonPath('data.unallocated_paisa', 10000);

    $res = $this->postJson(hBillPath($mess, $month, $wifi, '/spread'))->assertOk();

    expect($res->json('data.shares'))->toBe([$x => 23334, $y => 33333, $z => 43333])
        ->and($res->json('data.unallocated_paisa'))->toBe(0);
});

it('refuses to spread nothing or an over-allocation', function () {
    [$mess, , $month, $ids] = hSetup();
    $wifi = hCategory($mess);
    $this->putJson(hBillPath($mess, $month, $wifi), ['amount_paisa' => 90000])->assertOk();

    $this->postJson(hBillPath($mess, $month, $wifi, '/spread'))->assertStatus(409)->assertJsonPath('code', 'nothing_to_spread');

    // Z takes more than the whole bill: the others get 0 and the bill is over-allocated by 10000.
    $res = $this->putJson(hBillPath($mess, $month, $wifi), ['overrides' => [['member_id' => $ids[2], 'amount_paisa' => 100000]]])->assertOk();
    expect($res->json('data.unallocated_paisa'))->toBe(-10000);
    $this->postJson(hBillPath($mess, $month, $wifi, '/spread'))->assertStatus(409)->assertJsonPath('code', 'over_allocated');
});

it('refuses spread and accept on a by_meal category', function () {
    [$mess, , $month] = hSetup();
    $bazar = hCategory($mess, ['group' => 'meals', 'split_type' => 'by_meal']);

    $this->postJson(hBillPath($mess, $month, $bazar, '/spread'))->assertUnprocessable();
    $this->postJson(hBillPath($mess, $month, $bazar, '/accept'))->assertUnprocessable();
});

// ---------------------------------------------------------------- accept

it('accepts the unallocated amount, and any later change resets it', function () {
    [$mess, , $month, $ids] = hSetup();
    $rent = hCategory($mess, ['split_type' => 'fixed_per_person']);
    $this->putJson(hBillPath($mess, $month, $rent), ['amount_paisa' => 800000, 'overrides' => [['member_id' => $ids[0], 'amount_paisa' => 200000]]])->assertOk();

    $res = $this->postJson(hBillPath($mess, $month, $rent, '/accept'))->assertOk();
    expectContractShape($res->json('data'), 'Bill');
    expect($res->json('data.unallocated_accepted'))->toBeTrue()->and($res->json('data.unallocated_paisa'))->toBe(600000);

    $this->putJson(hBillPath($mess, $month, $rent), ['amount_paisa' => 800000])->assertOk()->assertJsonPath('data.unallocated_accepted', false);
});

it('can accept a meals bill that has no setup row yet', function () {
    [$mess, , $month] = hSetup();
    $tea = hCategory($mess, ['group' => 'meals', 'split_type' => 'equal']);

    $this->postJson(hBillPath($mess, $month, $tea, '/accept'))->assertOk()->assertJsonPath('data.unallocated_accepted', true);
});

// ---------------------------------------------------------------- member settings

it('sets and clears a member deposit and minimum meals', function () {
    [$mess, , $month, $ids] = hSetup();
    $path = messPath($mess, "months/{$month->id}/members/{$ids[1]}/settings");

    $res = $this->putJson($path, ['deposit_paisa' => 100000, 'min_meals_centi' => 2000])->assertOk();
    expectContractShape($res->json('data'), 'MemberMonthSetting');
    expect($res->json('data'))->toBe(['member_id' => $ids[1], 'deposit_paisa' => 100000, 'min_meals_centi' => 2000]);

    // Absent key untouched; null clears.
    $res = $this->putJson($path, ['min_meals_centi' => null])->assertOk();
    expect($res->json('data'))->toBe(['member_id' => $ids[1], 'deposit_paisa' => 100000, 'min_meals_centi' => null]);

    $this->putJson($path, ['deposit_paisa' => 0])->assertOk()->assertJsonPath('data.deposit_paisa', 0);
    expect(MemberMonthSetting::where('month_id', $month->id)->count())->toBe(1);
});

it('validates member settings', function (array $bad) {
    [$mess, , $month, $ids] = hSetup();

    $this->putJson(messPath($mess, "months/{$month->id}/members/{$ids[0]}/settings"), $bad)->assertUnprocessable();
})->with([
    'empty body' => [[]],
    'negative deposit' => [['deposit_paisa' => -1]],
    'float deposit' => [['deposit_paisa' => 1.5]],
    'negative meals' => [['min_meals_centi' => -1]],
    'string meals' => [['min_meals_centi' => 'abc']],
]);

it('refuses settings for a member who was not active in the month', function () {
    [$mess, , $month] = hSetup();
    $left = MessMember::factory()->for($mess)->create(['joined_on' => '2026-01-01', 'left_on' => '2026-10-15']);

    $this->putJson(messPath($mess, "months/{$month->id}/members/{$left->id}/settings"), ['deposit_paisa' => 1])
        ->assertUnprocessable()->assertJsonValidationErrors(['member']);
});

// ---------------------------------------------------------------- cross-cutting

it('answers 404 for another mess month, category or member', function () {
    [$mess, , $month, $ids] = hSetup();
    $wifi = hCategory($mess);
    $foreign = otherMess();
    $theirMonth = Month::factory()->create(['mess_id' => $foreign->id]);
    $theirCat = hCategory($foreign);
    $theirMember = MessMember::forMess($foreign->id)->first();

    $this->patchJson(messPath($mess, "months/{$theirMonth->id}/setup"), ['deposit_paisa' => 1])->assertNotFound();
    $this->putJson(hBillPath($mess, $theirMonth, $wifi), ['amount_paisa' => 1])->assertNotFound();
    $this->putJson(hBillPath($mess, $month, $theirCat), ['amount_paisa' => 1])->assertNotFound();
    $this->postJson(hBillPath($mess, $month, $theirCat, '/spread'))->assertNotFound();
    $this->postJson(hBillPath($mess, $theirMonth, $wifi, '/accept'))->assertNotFound();
    $this->putJson(messPath($mess, "months/{$month->id}/members/{$theirMember->id}/settings"), ['deposit_paisa' => 1])->assertNotFound();
    $this->putJson(messPath($mess, "months/{$theirMonth->id}/members/{$ids[0]}/settings"), ['deposit_paisa' => 1])->assertNotFound();
});

it('answers 404 to a user who is not in the mess', function () {
    [$mess, , $month] = hSetup();
    $foreign = otherMess();
    $this->actingAs(MessMember::forMess($foreign->id)->first()->user);

    $this->getJson(messPath($mess, "months/{$month->id}/setup"))->assertNotFound();
});

it('keeps every write manager-only', function (string $method, string $suffix, array $body) {
    [$mess, , $month, $ids] = hSetup('member');
    $wifi = hCategory($mess);
    $path = messPath($mess, "months/{$month->id}".str_replace(['{cat}', '{member}'], [$wifi->id, $ids[0]], $suffix));

    $this->json($method, $path, $body)->assertForbidden();
})->with([
    'patch setup' => ['PATCH', '/setup', ['deposit_paisa' => 1]],
    'put bill' => ['PUT', '/bills/{cat}', ['amount_paisa' => 1]],
    'spread' => ['POST', '/bills/{cat}/spread', []],
    'accept' => ['POST', '/bills/{cat}/accept', []],
    'member settings' => ['PUT', '/members/{member}/settings', ['deposit_paisa' => 1]],
]);

it('also refuses the admin when they are not the manager', function () {
    [$mess, , $month] = hSetup('admin');

    $this->patchJson(messPath($mess, "months/{$month->id}/setup"), ['deposit_paisa' => 1])->assertForbidden();
});

it('rejects every write on a closed month with 409 month_closed', function (string $method, string $suffix, array $body) {
    [$mess, , $month, $ids] = hSetup('manager', closed: true);
    $wifi = hCategory($mess);
    $path = messPath($mess, "months/{$month->id}".str_replace(['{cat}', '{member}'], [$wifi->id, $ids[0]], $suffix));

    $this->json($method, $path, $body)->assertStatus(409)->assertJsonPath('code', 'month_closed');
    expect(MonthBill::count() + ChargeOverride::count() + MemberMonthSetting::count())->toBe(0);
})->with([
    'patch setup' => ['PATCH', '/setup', ['deposit_paisa' => 1]],
    'put bill' => ['PUT', '/bills/{cat}', ['amount_paisa' => 1]],
    'spread' => ['POST', '/bills/{cat}/spread', []],
    'accept' => ['POST', '/bills/{cat}/accept', []],
    'member settings' => ['PUT', '/members/{member}/settings', ['deposit_paisa' => 1]],
]);

it('still shows a closed month setup', function () {
    [$mess, , $month] = hSetup('manager', closed: true);

    $this->getJson(messPath($mess, "months/{$month->id}/setup"))->assertOk();
});

it('blocks archived members from writing', function () {
    [$mess, , $month] = hSetup('archived');

    $this->patchJson(messPath($mess, "months/{$month->id}/setup"), ['deposit_paisa' => 1])->assertForbidden();
    $this->getJson(messPath($mess, "months/{$month->id}/setup"))->assertForbidden();
});
