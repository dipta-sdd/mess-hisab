<?php

use App\Enums\ExpenseStatus;
use App\Enums\PaidBy;
use App\Models\Category;
use App\Models\ChargeOverride;
use App\Models\Expense;
use App\Models\MealEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\MonthBill;
use App\Models\Payment;
use Illuminate\Support\Carbon;

/**
 * Shared by the Balance feature tests. A month 2026-11-01..30 with exactly $count active members
 * (ids ascending). Returns [Mess, MessMember me, Month, int[] ids].
 */
function jSetup(string $role = 'member', int $count = 3, array $monthAttrs = []): array
{
    [$mess, $me] = actingAsMember($role);
    $month = Month::factory()->create(['mess_id' => $mess->id] + $monthAttrs);
    while (MessMember::forMess($mess->id)->count() < $count) {
        MessMember::factory()->for($mess)->create();
    }

    // Joined before October, so the members are active in the earlier months some tests build too.
    MessMember::forMess($mess->id)->update(['joined_on' => '2026-09-01']);

    return [$mess, $me->fresh(), $month, MessMember::forMess($mess->id)->orderBy('id')->pluck('id')->all()];
}

function jToday(string $date): void
{
    test()->travelTo(Carbon::parse($date.' 12:00:00', config('app.timezone')));
}

function jCategory(Mess $mess, array $attrs = []): Category
{
    return Category::factory()->create(['mess_id' => $mess->id] + $attrs);
}

function jBill(Mess $mess, Month $month, Category $cat, int $paisa, array $overrides = []): void
{
    MonthBill::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $cat->id, 'amount_paisa' => $paisa]);
    foreach ($overrides as $memberId => $amount) {
        ChargeOverride::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $cat->id, 'member_id' => $memberId, 'amount_paisa' => $amount]);
    }
}

function jPay(Mess $mess, Month $month, int $memberId, string $group, int $paisa, string $on = '2026-11-03'): Payment
{
    return Payment::factory()->create([
        'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $memberId, 'group' => $group,
        'amount_paisa' => $paisa, 'paid_on' => $on, 'received_by_member_id' => $mess->manager_member_id,
        'created_by_member_id' => $mess->manager_member_id,
    ]);
}

function jExpense(Mess $mess, Month $month, Category $cat, int $paisa, ?int $paidByMember = null, array $over = []): Expense
{
    return Expense::factory()->create([
        'mess_id' => $mess->id, 'month_id' => $month->id, 'category_id' => $cat->id, 'amount_paisa' => $paisa,
        'paid_by' => $paidByMember ? PaidBy::Member : PaidBy::Cash, 'paid_by_member_id' => $paidByMember,
        'created_by_member_id' => $paidByMember ?? $mess->manager_member_id, 'status' => ExpenseStatus::Approved,
    ] + $over);
}

/** A day of meals; $centi is own meals in centi-meals (2000 = 20 meals). Dates must be distinct per member. */
function jMeals(Mess $mess, Month $month, int $memberId, int $centi, int $guest = 0, string $on = '2026-11-05'): void
{
    MealEntry::factory()->create([
        'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $memberId,
        'entry_date' => $on, 'meals_centi' => $centi, 'guest_meals_centi' => $guest,
    ]);
}

/** PROJECT §7 example 2 (X, Y, Z = $ids): rent, wifi, food. Deadlines and deposit as in the example. */
function jExample2(Mess $mess, Month $month, array $ids): void
{
    [$x, $y, $z] = $ids;
    $month->update(['fixed_deadline' => '2026-11-10', 'deposit_deadline' => '2026-11-05', 'deposit_paisa' => 100000]);
    $mess->update(['rounding_mode' => 'whole_taka']);

    $rent = jCategory($mess, ['name' => 'Rent', 'split_type' => 'fixed_per_person', 'sort' => 1]);
    $wifi = jCategory($mess, ['name' => 'Wifi', 'split_type' => 'equal', 'sort' => 2]);
    $bazar = jCategory($mess, ['name' => 'Bazar', 'group' => 'meals', 'split_type' => 'by_meal', 'sort' => 3]);

    jBill($mess, $month, $rent, 750000, [$x => 200000, $y => 350000, $z => 200000]);
    jBill($mess, $month, $wifi, 90000);
    jExpense($mess, $month, $bazar, 150000, $x); // X paid from pocket
    jExpense($mess, $month, $bazar, 50000);      // the rest from the cash pool
    jPay($mess, $month, $z, 'meals', 50000);     // Z's meals deposit funds that cash
    jMeals($mess, $month, $x, 2000);
    jMeals($mess, $month, $y, 1000);
    jMeals($mess, $month, $z, 2000);
}

/** Row of the dashboard for one member. */
function jRow(array $dashboard, int $memberId): array
{
    foreach ($dashboard['members'] as $row) {
        if ($row['member_id'] === $memberId) {
            return $row;
        }
    }
    throw new RuntimeException("member {$memberId} not on the dashboard");
}

/** Every key of every value of $fixture's nested objects/lists must exist in $actual (and nothing extra). */
function jExpectNestedShape(array $actual, array $fixture, string $path = ''): void
{
    $a = array_keys($actual);
    $f = array_keys($fixture);
    sort($a);
    sort($f);
    expect($a)->toBe($f, "keys differ at '{$path}'");

    foreach ($fixture as $key => $value) {
        if (! is_array($value) || $value === []) {
            continue;
        }
        if (array_is_list($value)) {
            foreach ($actual[$key] as $i => $item) {
                if (is_array($item)) {
                    jExpectNestedShape($item, $value[0], "{$path}.{$key}[{$i}]");
                }
            }
        } else {
            jExpectNestedShape($actual[$key], $value, "{$path}.{$key}");
        }
    }
}

function jFixture(string $name): array
{
    return json_decode(file_get_contents(base_path("../docs/contract-fixtures/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);
}
