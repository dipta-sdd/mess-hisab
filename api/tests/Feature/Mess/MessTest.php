<?php

use App\Enums\Group;
use App\Enums\LedgerType;
use App\Enums\MonthStatus;
use App\Models\Category;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Mess\MonthBoundary;
use Illuminate\Support\Carbon;

function cMessPayload(array $over = []): array
{
    return array_merge([
        'name' => 'Sunrise Mess',
        'first_month_starts_on' => '2026-11-01',
        'creator_display_name' => 'Shuvendu',
    ], $over);
}

it('creates a mess with the creator as admin and manager', function () {
    $user = user();
    $this->actingAs($user);

    $res = $this->postJson('/api/messes', cMessPayload())->assertCreated();

    expectContractShape($res->json('data.mess'), 'Mess');
    expectContractShape($res->json('data.member'), 'Member');

    $mess = Mess::findOrFail($res->json('data.mess.id'));
    $member = MessMember::forMess($mess->id)->sole();
    expect($res->json('data.member'))->toMatchArray([
        'id' => $member->id, 'user_id' => $user->id, 'display_name' => 'Shuvendu', 'has_account' => true,
        'is_admin' => true, 'is_manager' => true, 'joined_on' => '2026-11-01',
    ]);
    expect($res->json('data.mess'))->toMatchArray([
        'name' => 'Sunrise Mess', 'month_start_day' => 1, 'admin_member_id' => $member->id, 'manager_member_id' => $member->id,
        'currency' => 'BDT', 'fixed_due_day_offset' => 5, 'rounding_mode' => 'whole_taka',
    ]);
    expect($mess->created_by_user_id)->toBe($user->id);
});

it('creates the first month with deadlines from the mess offsets', function () {
    $this->actingAs(user());

    $id = $this->postJson('/api/messes', cMessPayload(['first_month_starts_on' => '2026-11-10', 'month_start_day' => 10]))->assertCreated()->json('data.mess.id');

    $month = Month::forMess($id)->sole();
    expect($month->starts_on->toDateString())->toBe('2026-11-10')
        ->and($month->ends_on->toDateString())->toBe('2026-12-09')
        ->and($month->status)->toBe(MonthStatus::Open)
        ->and($month->fixed_deadline->toDateString())->toBe('2026-11-14')
        ->and($month->deposit_deadline->toDateString())->toBe('2026-11-14')
        ->and($month->deposit_paisa)->toBe(0);
});

it('ends an off-day first month at the next boundary', function () {
    expect(MonthBoundary::endFor(Carbon::parse('2026-11-01'), 1)->toDateString())->toBe('2026-11-30');
    expect(MonthBoundary::endFor(Carbon::parse('2026-11-20'), 1)->toDateString())->toBe('2026-11-30');
    expect(MonthBoundary::endFor(Carbon::parse('2026-11-05'), 10)->toDateString())->toBe('2026-11-09');
    expect(MonthBoundary::endFor(Carbon::parse('2026-11-10'), 10)->toDateString())->toBe('2026-12-09');
    expect(MonthBoundary::endFor(Carbon::parse('2026-12-28'), 28)->toDateString())->toBe('2027-01-27');
});

it('creates exactly the default categories', function () {
    $this->actingAs(user());

    $id = $this->postJson('/api/messes', cMessPayload())->assertCreated()->json('data.mess.id');

    $rows = Category::forMess($id)->orderBy('sort')->get()->map(fn ($c) => [$c->group->value, $c->name, $c->split_type->value, $c->is_default])->all();
    expect($rows)->toBe([
        ['fixed', 'Rent', 'fixed_per_person', true],
        ['fixed', 'Wifi', 'equal', true],
        ['fixed', 'Electricity', 'equal', true],
        ['fixed', 'Cook', 'equal', true],
        ['meals', 'Bazar', 'by_meal', true],
    ]);
});

it('creates placeholder members and opening ledger rows in one go', function () {
    $this->actingAs($user = user());

    $id = $this->postJson('/api/messes', cMessPayload([
        'creator_opening_balance_paisa' => -141000,
        'members' => [
            ['display_name' => 'Dipta', 'opening_balance_paisa' => 351000],
            ['display_name' => 'Nilu'],
            ['display_name' => 'Zero', 'opening_balance_paisa' => 0],
        ],
    ]))->assertCreated()->json('data.mess.id');

    $members = MessMember::forMess($id)->orderBy('id')->get();
    expect($members->pluck('display_name')->all())->toBe(['Shuvendu', 'Dipta', 'Nilu', 'Zero']);
    expect($members->pluck('user_id')->all())->toBe([$user->id, null, null, null]);

    $month = Month::forMess($id)->sole();
    $ledger = LedgerEntry::forMess($id)->orderBy('id')->get();
    expect($ledger)->toHaveCount(2);
    foreach ($ledger as $row) {
        expect($row->type)->toBe(LedgerType::Opening)->and($row->group)->toBe(Group::Fixed)->and($row->month_id)->toBe($month->id);
    }
    expect($ledger->pluck('amount_paisa', 'member_id')->all())->toBe([$members[0]->id => -141000, $members[1]->id => 351000]);
});

it('writes nothing when validation fails (and nothing half-created)', function () {
    $this->actingAs(user());

    $this->postJson('/api/messes', [])->assertUnprocessable()->assertJsonValidationErrors(['name', 'first_month_starts_on', 'creator_display_name']);
    $this->postJson('/api/messes', cMessPayload(['month_start_day' => 29]))->assertUnprocessable()->assertJsonValidationErrors(['month_start_day']);
    $this->postJson('/api/messes', cMessPayload(['first_month_starts_on' => 'tomorrow']))->assertUnprocessable()->assertJsonValidationErrors(['first_month_starts_on']);
    $this->postJson('/api/messes', cMessPayload(['members' => [['display_name' => '']]]))->assertUnprocessable()->assertJsonValidationErrors(['members.0.display_name']);
    $this->postJson('/api/messes', cMessPayload(['creator_opening_balance_paisa' => 12.5]))->assertUnprocessable()->assertJsonValidationErrors(['creator_opening_balance_paisa']);

    expect(Mess::count())->toBe(0)->and(Month::count())->toBe(0);
});

it('requires auth to create a mess', function () {
    $this->postJson('/api/messes', cMessPayload())->assertUnauthorized();
});

it('shows a mess to its members with their own member row', function () {
    [$mess, $me] = actingAsMember('manager');

    $res = $this->getJson(messPath($mess))->assertOk();

    expectContractShape($res->json('data.mess'), 'Mess');
    expectContractShape($res->json('data.me'), 'Member');
    expect($res->json('data.mess.id'))->toBe($mess->id)
        ->and($res->json('data.me'))->toMatchArray(['id' => $me->id, 'is_manager' => true, 'is_admin' => false]);
});

it('lets an archived member read the mess', function () {
    [$mess, $me] = actingAsMember('archived');

    $this->getJson(messPath($mess))->assertOk()->assertJsonPath('data.me.archived_at', fn ($v) => $v !== null);
});

it('returns 404 for a mess the user is not in', function () {
    actingAsMember();

    $this->getJson(messPath(otherMess()))->assertNotFound();
    $this->getJson('/api/messes/999999')->assertNotFound();
});

it('requires auth to show a mess', function () {
    $this->getJson(messPath(otherMess()))->assertUnauthorized();
});
