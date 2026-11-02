<?php

use App\Models\Category;
use App\Models\Month;
use App\Models\User;

require_once __DIR__.'/../Lifecycle/LifecycleHelpers.php';

/** Closes the kScenario month and returns [mess, month, ids, nextMonth]. */
function rClosed(string $role = 'admin_manager', bool $withNextBills = true): array
{
    [$mess, $me, $month, $ids] = kScenario($role);
    test()->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertOk();
    $next = Month::query()->where('mess_id', $mess->id)->where('starts_on', '>', $month->ends_on)->orderBy('starts_on')->firstOrFail();
    if ($withNextBills) {
        $rent = Category::query()->where('mess_id', $mess->id)->where('name', 'Rent')->firstOrFail();
        jBill($mess, $next, $rent, 600000);
    }

    return [$mess, $month, $ids, $next];
}

function rUrl($mess, $month): string
{
    return "/api/messes/{$mess->id}/reports/monthly/{$month->id}";
}

it('builds the report with per-person next-month totals matching the Fixed page', function () {
    [$mess, $month, $ids, $next] = rClosed();
    $balances = [];

    $data = $this->getJson(rUrl($mess, $month))->assertOk()->json('data');

    expect(array_keys($data))->toBe(['month', 'mess', 'summary', 'members', 'expenses', 'meals', 'next_month']);
    expect($data['month']['id'])->toBe($month->id);
    expect($data['summary']['member_count'])->toBe(3);
    expect($data['summary']['expense_count'])->toBe(1);
    expect($data['expenses'][0]['amount_paisa'])->toBe(90000);
    expect($data['expenses'][0]['payer_name'])->not->toBeNull();
    expect($data['expenses'][0]['category'])->toBe('Bazar');
    expect($data['members'])->toHaveCount(3);
    foreach ($data['members'] as $m) {
        $balances[$m["member_id"]] = $m["balance_paisa"];
        expect($m['share_paisa'])->toBe($m['fixed_bill_paisa'] + $m['meals_bill_paisa']);
        // The one bazar was paid from the payer's pocket: it counts as spent, not as a deposit.
        expect($m['spent_paisa'])->toBe($m['member_id'] === $data['expenses'][0]['paid_by_member_id'] ? 90000 : 0);
    }
    expect($data['summary']['spent_paisa'])->toBe(90000);
    expect($data['meals'])->not->toBeNull();
    expect($data['meals']['members'])->toHaveCount(3);

    expect($data['next_month']['month']['id'])->toBe($next->id);
    expect($data['next_month']['fixed_deadline'])->toBe($next->fresh()->fixed_deadline->toDateString());
    expect($data['next_month']['rows'])->toHaveCount(3);

    // Cross-check against the next month's own dashboard ("Last month due" = its carry-in).
    $dash = $this->getJson("/api/messes/{$mess->id}/dashboard?month_id={$next->id}")->assertOk()->json('data');
    foreach ($data['next_month']['rows'] as $row) {
        expect($row['by_category'])->toHaveCount(1);
        expect($row['by_category'][0]['name'])->toBe('Rent');
        expect($row['by_category'][0]['split_type'])->toBe('equal');
        expect($row['by_category'][0]['amount_paisa'])->toBe(200000);
        $carry = jRow($dash, $row['member_id'])['carry_in_paisa'];
        expect($row['last_month_due_paisa'])->toBe(max(0, -$carry));
        expect($row['last_month_credit_paisa'])->toBe(max(0, $carry));
        expect($row['total_paisa'])->toBe(max(0, 200000 - $carry));
        expect($carry)->toBe($balances[$row["member_id"]]);
    }
});

it('refuses an open month with 409 month_not_closed', function () {
    [$mess, , $month] = kScenario('admin_manager');
    $this->getJson(rUrl($mess, $month))->assertStatus(409)->assertJsonPath('code', 'month_not_closed');
});

it('refuses when next month has no saved Fixed bill', function () {
    [$mess, $month, , $next] = rClosed('admin_manager', false);
    $this->getJson(rUrl($mess, $month))->assertStatus(409)
        ->assertJsonPath('code', 'next_month_bills_missing')
        ->assertJsonPath('next_month_id', $next->id);
});

it('forbids a plain member and hides other messes', function () {
    [$mess, , $month] = kScenario('member');
    $this->getJson(rUrl($mess, $month))->assertForbidden();

    $other = otherMess();
    $this->getJson("/api/messes/{$other->id}/reports/monthly/{$month->id}")->assertNotFound();
});

it('lets the admin and the manager in', function () {
    [$mess, , $month] = kScenario('admin');
    $this->getJson(rUrl($mess, $month))->assertStatus(409); // allowed in, month still open
});

it('lets the manager in', function () {
    [$mess, , $month] = kScenario('manager');
    $this->getJson(rUrl($mess, $month))->assertStatus(409);
});

it('404s a month of another mess', function () {
    [$mess] = kScenario('admin_manager');
    $other = otherMess();
    $foreign = Month::factory()->create(['mess_id' => $other->id, 'starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    $this->getJson(rUrl($mess, $foreign))->assertNotFound();
});

it('works with a Bangla locale', function () {
    [$mess, $month] = rClosed();
    User::query()->update(['locale' => 'bn']);
    $this->getJson(rUrl($mess, $month))->assertOk()->assertJsonCount(3, 'data.next_month.rows');

    Month::query()->whereKey($month->id)->update(['status' => 'open']);
    $this->getJson(rUrl($mess, $month))->assertStatus(409)->assertJsonPath('code', 'month_not_closed');
});

it('returns meals null when meal tracking is off', function () {
    [$mess, , $month] = kScenario('admin_manager');
    $mess->update(['meal_tracking' => 'off']);
    $this->postJson("/api/messes/{$mess->id}/months/{$month->id}/close")->assertOk();
    $next = Month::query()->where('mess_id', $mess->id)->where('starts_on', '>', $month->ends_on)->firstOrFail();
    jBill($mess, $next, Category::query()->where('mess_id', $mess->id)->where('name', 'Rent')->firstOrFail(), 600000);

    $this->getJson(rUrl($mess, $month))->assertOk()->assertJsonPath('data.meals', null);
});
