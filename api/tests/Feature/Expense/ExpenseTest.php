<?php

use App\Enums\ExpenseStatus;
use App\Enums\PaidBy;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Expense;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Payment;
use App\Services\CashPool\CashPool;
use Illuminate\Support\Carbon;

beforeEach(fn () => Carbon::setTestNow(Carbon::parse('2026-11-10 12:00', 'Asia/Dhaka')));
afterEach(fn () => Carbon::setTestNow());

function exMonth(Mess $mess, array $attrs = []): Month
{
    return Month::factory()->create(['mess_id' => $mess->id] + $attrs);
}

function exCategory(Mess $mess, array $attrs = []): Category
{
    return Category::factory()->meals()->create(['mess_id' => $mess->id] + $attrs);
}

function exPayload(Category $cat, array $over = []): array
{
    return ['category_id' => $cat->id, 'amount_paisa' => 50000, 'spent_on' => '2026-11-05', 'paid_by' => 'member', ...$over];
}

/** Put $paisa into the cash pool (a payment received by the manager). */
function exFundPool(Mess $mess, Month $month, int $paisa): void
{
    $payer = MessMember::factory()->for($mess)->create();
    Payment::factory()->create([
        'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $payer->id,
        'received_by_member_id' => $mess->manager_member_id, 'amount_paisa' => $paisa,
    ]);
}

function exRecord(Mess $mess, Month $month, MessMember $by, array $attrs = []): Expense
{
    return Expense::factory()->create($attrs + [
        'mess_id' => $mess->id, 'month_id' => $month->id, 'created_by_member_id' => $by->id,
        'paid_by_member_id' => $by->id, 'category_id' => exCategory($mess)->id,
    ]);
}

// ---------------------------------------------------------------- create

it('lets a member record their own expense', function () {
    [$mess, $me] = actingAsMember('member');
    $month = exMonth($mess);
    $cat = exCategory($mess);

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload($cat, ['note' => 'rice']))->assertCreated();

    expectContractShape($res->json('data.expense'), 'Expense');
    expect($res->json('data.warnings'))->toBe([]);
    expect($res->json('data.expense'))->toMatchArray([
        'month_id' => $month->id, 'category_id' => $cat->id, 'amount_paisa' => 50000, 'spent_on' => '2026-11-05',
        'note' => 'rice', 'paid_by' => 'member', 'paid_by_member_id' => $me->id, 'status' => 'approved',
        'is_late' => false, 'short_cash_converted' => false, 'is_self_recorded' => false,
        'created_by_member_id' => $me->id, 'approved_by_member_id' => $me->id,
    ]);
    expect(AuditLog::where('event', 'expense.created')->where('mess_id', $mess->id)->count())->toBe(1);
});

it('lets the manager record anything and marks it self-recorded', function () {
    [$mess, $me] = actingAsMember('manager');
    exMonth($mess);
    $cat = exCategory($mess);
    $friend = MessMember::factory()->for($mess)->create();

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload($cat, ['paid_by_member_id' => $friend->id]))->assertCreated();

    expect($res->json('data.expense.paid_by_member_id'))->toBe($friend->id);
    expect($res->json('data.expense.is_self_recorded'))->toBeTrue();
    expect($res->json('data.expense.created_by_member_id'))->toBe($me->id);
});

it('does not let a member record for someone else or from mess cash', function (array $over, string $field) {
    [$mess, $me] = actingAsMember('member');
    exMonth($mess);
    $cat = exCategory($mess);
    $other = MessMember::factory()->for($mess)->create();
    $over = array_map(fn ($v) => $v === 'OTHER' ? $other->id : $v, $over);

    $this->postJson(messPath($mess, 'expenses'), exPayload($cat, $over))
        ->assertUnprocessable()->assertJsonValidationErrors([$field]);
    expect(Expense::forMess($mess->id)->count())->toBe(0);
})->with([
    'for another member' => [['paid_by_member_id' => 'OTHER'], 'paid_by_member_id'],
    'from mess cash' => [['paid_by' => 'cash'], 'paid_by'],
]);

it('defaults a member payer to themselves', function () {
    [$mess, $me] = actingAsMember('member');
    exMonth($mess);
    $res = $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess)))->assertCreated();
    expect($res->json('data.expense.paid_by_member_id'))->toBe($me->id);
});

it('validates the payload', function (array $bad, string $field) {
    [$mess] = actingAsMember('manager');
    exMonth($mess);
    $cat = exCategory($mess);
    $archivedCat = exCategory($mess, ['archived_at' => now()]);
    $foreignCat = Category::factory()->create(['mess_id' => otherMess()->id]);
    $bad = array_map(fn ($v) => match ($v) {
        'ARCHIVED_CAT' => $archivedCat->id, 'FOREIGN_CAT' => $foreignCat->id, default => $v,
    }, $bad);

    $this->postJson(messPath($mess, 'expenses'), array_merge(exPayload($cat), $bad))
        ->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'zero amount' => [['amount_paisa' => 0], 'amount_paisa'],
    'negative amount' => [['amount_paisa' => -5], 'amount_paisa'],
    'float amount' => [['amount_paisa' => 10.5], 'amount_paisa'],
    'string amount' => [['amount_paisa' => '10.5'], 'amount_paisa'],
    'bad paid_by' => [['paid_by' => 'bank'], 'paid_by'],
    'bad date' => [['spent_on' => '05/11/2026'], 'spent_on'],
    'future month' => [['spent_on' => '2027-03-01'], 'spent_on'],
    'before first month' => [['spent_on' => '2020-01-01'], 'spent_on'],
    'missing category' => [['category_id' => null], 'category_id'],
    'archived category' => [['category_id' => 'ARCHIVED_CAT'], 'category_id'],
    'other mess category' => [['category_id' => 'FOREIGN_CAT'], 'category_id'],
    'cash with a payer' => [['paid_by' => 'cash', 'paid_by_member_id' => 1], 'paid_by_member_id'],
]);

it('rejects a payer from another mess', function () {
    [$mess] = actingAsMember('manager');
    exMonth($mess);
    $foreign = MessMember::factory()->for(otherMess())->create();

    $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess), ['paid_by_member_id' => $foreign->id]))
        ->assertUnprocessable()->assertJsonValidationErrors(['paid_by_member_id']);
});

it('puts a date in a closed month into the current open month as a late entry', function () {
    [$mess] = actingAsMember('member');
    exMonth($mess, ['starts_on' => '2026-10-01', 'ends_on' => '2026-10-31'])->update(['status' => 'closed', 'closed_at' => now()]);
    $nov = exMonth($mess);

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess), ['spent_on' => '2026-10-20']))->assertCreated();

    expect($res->json('data.expense.month_id'))->toBe($nov->id);
    expect($res->json('data.expense.is_late'))->toBeTrue();
    expect($res->json('data.expense.spent_on'))->toBe('2026-10-20');
});

it('requires approval from members when the mess asks for it, but not from the manager', function () {
    [$mess, $me] = actingAsMember('member');
    $mess->update(['approval_required' => true]);
    exMonth($mess);
    $cat = exCategory($mess);

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload($cat))->assertCreated();
    expect($res->json('data.expense.status'))->toBe('pending');
    expect($res->json('data.expense.approved_by_member_id'))->toBeNull();

    $this->actingAs($mess->fresh()->manager->user);
    $res = $this->postJson(messPath($mess, 'expenses'), exPayload($cat, ['paid_by' => 'cash', 'amount_paisa' => 1]))->assertCreated();
    expect($res->json('data.expense.status'))->toBe('approved');
});

// ---------------------------------------------------------------- short cash

it('keeps a cash expense as cash when the pool covers it exactly', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    exFundPool($mess, $month, 50000);

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess), ['paid_by' => 'cash']))->assertCreated();

    expect($res->json('data.expense'))->toMatchArray(['paid_by' => 'cash', 'paid_by_member_id' => null, 'short_cash_converted' => false]);
    expect($res->json('data.warnings'))->toBe([]);
    expect(CashPool::balance($mess))->toBe(0);
});

it('converts the whole expense to the manager\'s own money when the pool is one paisa short', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    exFundPool($mess, $month, 49999);

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess), ['paid_by' => 'cash']))->assertCreated();

    expect($res->json('data.expense'))->toMatchArray([
        'paid_by' => 'member', 'paid_by_member_id' => $me->id, 'short_cash_converted' => true, 'status' => 'approved',
    ]);
    expect($res->json('data.warnings'))->toBe(['short_cash_converted']);
    expect(CashPool::balance($mess))->toBe(49999);
});

it('converts the whole expense on a partial shortfall (buys 500 with 200 in the pool)', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    exFundPool($mess, $month, 20000);

    $res = $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess), ['paid_by' => 'cash', 'amount_paisa' => 50000]))->assertCreated();

    expect($res->json('data.expense.amount_paisa'))->toBe(50000);
    expect($res->json('data.expense.paid_by'))->toBe('member');
    expect($res->json('data.expense.paid_by_member_id'))->toBe($me->id);
    expect($res->json('data.warnings'))->toBe(['short_cash_converted']);
    expect(CashPool::balance($mess))->toBe(20000);
});

it('converts when the pool is empty and never lets the pool go negative across several expenses', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    exFundPool($mess, $month, 70000);
    $cat = exCategory($mess);

    $first = $this->postJson(messPath($mess, 'expenses'), exPayload($cat, ['paid_by' => 'cash']))->assertCreated();
    $second = $this->postJson(messPath($mess, 'expenses'), exPayload($cat, ['paid_by' => 'cash']))->assertCreated();

    expect($first->json('data.expense.paid_by'))->toBe('cash');
    expect($second->json('data.expense.short_cash_converted'))->toBeTrue();
    expect(CashPool::balance($mess))->toBe(20000);
});

it('does not count pending cash expenses against the pool until approved, then converts if short', function () {
    [$mess, $me] = actingAsMember('manager');
    $mess->update(['approval_required' => true]);
    $month = exMonth($mess);
    exFundPool($mess, $month, 50000);
    $member = MessMember::factory()->for($mess)->create();
    $cat = exCategory($mess);

    // Two pending cash expenses (set up directly: members cannot record cash through the API).
    $a = exRecord($mess, $month, $member, ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null, 'status' => ExpenseStatus::Pending, 'category_id' => $cat->id]);
    $b = exRecord($mess, $month, $member, ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null, 'status' => ExpenseStatus::Pending, 'category_id' => $cat->id]);
    expect(CashPool::balance($mess))->toBe(50000);

    $this->postJson(messPath($mess, "expenses/{$a->id}/approve"))->assertOk()
        ->assertJsonPath('data.paid_by', 'cash')->assertJsonPath('data.short_cash_converted', false);
    expect(CashPool::balance($mess))->toBe(0);

    $res = $this->postJson(messPath($mess, "expenses/{$b->id}/approve"))->assertOk();
    expect($res->json('data'))->toMatchArray(['paid_by' => 'member', 'paid_by_member_id' => $me->id, 'short_cash_converted' => true]);
    expect(CashPool::balance($mess))->toBe(0);
});

// ---------------------------------------------------------------- index

it('lists expenses for any member with filters', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    $other = MessMember::factory()->for($mess)->create();
    $catA = exCategory($mess);
    $catB = exCategory($mess);
    exRecord($mess, $month, $me, ['category_id' => $catA->id]);
    exRecord($mess, $month, $other, ['category_id' => $catB->id, 'status' => ExpenseStatus::Pending]);
    exForeignExpense();

    $all = $this->getJson(messPath($mess, 'expenses'))->assertOk();
    expect($all->json('data'))->toHaveCount(2);
    foreach ($all->json('data') as $row) {
        expectContractShape($row, 'Expense');
    }

    expect($this->getJson(messPath($mess, "expenses?member_id={$me->id}"))->json('data'))->toHaveCount(1);
    expect($this->getJson(messPath($mess, 'expenses?status=pending'))->json('data'))->toHaveCount(1);
    expect($this->getJson(messPath($mess, "expenses?category_id={$catA->id}"))->json('data'))->toHaveCount(1);
    expect($this->getJson(messPath($mess, "expenses?month_id={$month->id}"))->json('data'))->toHaveCount(2);
    expect($this->getJson(messPath($mess, 'expenses?month_id='.($month->id + 999)))->json('data'))->toBe([]);
    $this->getJson(messPath($mess, 'expenses?status=bogus'))->assertUnprocessable();
});

// ---------------------------------------------------------------- update / delete

it('lets the owner edit and delete while pending, but not once approved (approval on)', function () {
    [$mess, $me] = actingAsMember('member');
    $mess->update(['approval_required' => true]);
    $month = exMonth($mess);
    $pending = exRecord($mess, $month, $me, ['status' => ExpenseStatus::Pending]);
    $approved = exRecord($mess, $month, $me);

    $res = $this->patchJson(messPath($mess, "expenses/{$pending->id}"), ['amount_paisa' => 12345, 'note' => 'fixed'])->assertOk();
    expectContractShape($res->json('data'), 'Expense');
    expect($res->json('data'))->toMatchArray(['amount_paisa' => 12345, 'note' => 'fixed']);

    $this->patchJson(messPath($mess, "expenses/{$approved->id}"), ['amount_paisa' => 1])->assertConflict()->assertJsonPath('code', 'already_approved');
    $this->deleteJson(messPath($mess, "expenses/{$approved->id}"))->assertConflict()->assertJsonPath('code', 'already_approved');

    $this->deleteJson(messPath($mess, "expenses/{$pending->id}"))->assertNoContent();
    expect(Expense::forMess($mess->id)->count())->toBe(1);
    expect(Expense::forMess($mess->id)->withTrashed()->count())->toBe(2);
});

it('lets the owner edit an approved expense while the month is open when approval is off', function () {
    [$mess, $me] = actingAsMember('member');
    $month = exMonth($mess);
    $e = exRecord($mess, $month, $me);

    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['amount_paisa' => 777])->assertOk()->assertJsonPath('data.amount_paisa', 777);
    $this->deleteJson(messPath($mess, "expenses/{$e->id}"))->assertNoContent();
});

it('lets the manager change any expense while the month is open', function () {
    [$mess, $me] = actingAsMember('manager');
    $mess->update(['approval_required' => true]);
    $month = exMonth($mess);
    $member = MessMember::factory()->for($mess)->create();
    $e = exRecord($mess, $month, $member);

    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['amount_paisa' => 4242])->assertOk()->assertJsonPath('data.amount_paisa', 4242);
    $this->deleteJson(messPath($mess, "expenses/{$e->id}"))->assertNoContent();
});

it('forbids a member from changing someone else\'s expense', function () {
    [$mess, $me] = actingAsMember('member');
    $month = exMonth($mess);
    $other = MessMember::factory()->for($mess)->create();
    $e = exRecord($mess, $month, $other);

    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['amount_paisa' => 1])->assertForbidden();
    $this->deleteJson(messPath($mess, "expenses/{$e->id}"))->assertForbidden();
});

it('blocks edits and deletes in a closed month', function (string $role) {
    [$mess, $me] = actingAsMember($role);
    $month = exMonth($mess, ['status' => 'closed', 'closed_at' => now()]);
    $e = exRecord($mess, $month, $me);

    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['amount_paisa' => 1])->assertConflict()->assertJsonPath('code', 'month_closed');
    $this->deleteJson(messPath($mess, "expenses/{$e->id}"))->assertConflict()->assertJsonPath('code', 'month_closed');
})->with(['member', 'manager']);

it('validates PATCH fields and keeps a member from re-pointing the payer', function () {
    [$mess, $me] = actingAsMember('member');
    $month = exMonth($mess);
    $other = MessMember::factory()->for($mess)->create();
    $e = exRecord($mess, $month, $me);

    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['amount_paisa' => 0])->assertUnprocessable()->assertJsonValidationErrors(['amount_paisa']);
    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['spent_on' => '2027-06-01'])->assertUnprocessable()->assertJsonValidationErrors(['spent_on']);
    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['paid_by_member_id' => $other->id])->assertUnprocessable()->assertJsonValidationErrors(['paid_by_member_id']);
    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['paid_by' => 'cash'])->assertUnprocessable()->assertJsonValidationErrors(['paid_by']);
});

it('keeps a non-manager from changing money on an expense not paid from their own pocket', function () {
    [$mess, $me] = actingAsMember('member');
    $month = exMonth($mess);
    // Recorded while they were the manager: cash, and one paid by someone else.
    $cash = exRecord($mess, $month, $me, ['paid_by' => 'cash', 'paid_by_member_id' => null]);
    $other = MessMember::factory()->for($mess)->create();
    $theirs = exRecord($mess, $month, $me, ['paid_by_member_id' => $other->id]);

    foreach ([$cash, $theirs] as $e) {
        foreach ([['amount_paisa' => 999999], ['note' => 'x'], ['spent_on' => '2026-11-06']] as $change) {
            $this->patchJson(messPath($mess, "expenses/{$e->id}"), $change)
                ->assertUnprocessable()->assertJsonValidationErrors(['paid_by']);
        }
        expect($e->fresh()->amount_paisa)->toBe($e->amount_paisa);
    }

    // Re-pointing it to their own pocket is the allowed way to take it over.
    $this->patchJson(messPath($mess, "expenses/{$theirs->id}"), ['paid_by_member_id' => $me->id])->assertOk();
});

it('re-runs the short-cash rule when an edit changes amount or payer', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    exFundPool($mess, $month, 50000);
    $cash = exRecord($mess, $month, $me, ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null, 'amount_paisa' => 30000]);
    $own = exRecord($mess, $month, $me, ['amount_paisa' => 10000]);

    // Raising the cash expense to the whole pool is fine (its own 30000 is not double counted).
    $this->patchJson(messPath($mess, "expenses/{$cash->id}"), ['amount_paisa' => 50000])->assertOk()
        ->assertJsonPath('data.paid_by', 'cash')->assertJsonPath('data.short_cash_converted', false);
    expect(CashPool::balance($mess))->toBe(0);

    // One paisa over the pool converts.
    $this->patchJson(messPath($mess, "expenses/{$cash->id}"), ['amount_paisa' => 50001])->assertOk()
        ->assertJsonPath('data.paid_by', 'member')->assertJsonPath('data.short_cash_converted', true);
    expect(CashPool::balance($mess))->toBe(50000);

    // Moving an own-pocket expense to cash when the pool is short converts it.
    $this->patchJson(messPath($mess, "expenses/{$own->id}"), ['paid_by' => 'cash', 'amount_paisa' => 60000])->assertOk()
        ->assertJsonPath('data.paid_by', 'member')->assertJsonPath('data.short_cash_converted', true);

    // ...and when the pool covers it, it stays cash.
    $this->patchJson(messPath($mess, "expenses/{$own->id}"), ['paid_by' => 'cash', 'amount_paisa' => 20000])->assertOk()
        ->assertJsonPath('data.paid_by', 'cash')->assertJsonPath('data.paid_by_member_id', null)->assertJsonPath('data.short_cash_converted', false);
    expect(CashPool::balance($mess))->toBe(30000);
});

it('re-assigns the month when the date moves into a closed month', function () {
    [$mess, $me] = actingAsMember('member');
    $oct = exMonth($mess, ['starts_on' => '2026-10-01', 'ends_on' => '2026-10-31']);
    $oct->update(['status' => 'closed', 'closed_at' => now()]);
    $nov = exMonth($mess);
    $e = exRecord($mess, $nov, $me);

    $res = $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['spent_on' => '2026-10-02'])->assertOk();
    expect($res->json('data.month_id'))->toBe($nov->id)->and($res->json('data.is_late'))->toBeTrue();
});

// ---------------------------------------------------------------- approve / reject

it('lets the manager approve a pending expense and audits it', function () {
    [$mess, $me] = actingAsMember('manager');
    $mess->update(['approval_required' => true]);
    $month = exMonth($mess);
    $member = MessMember::factory()->for($mess)->create();
    $e = exRecord($mess, $month, $member, ['status' => ExpenseStatus::Pending]);

    $res = $this->postJson(messPath($mess, "expenses/{$e->id}/approve"))->assertOk();

    expectContractShape($res->json('data'), 'Expense');
    expect($res->json('data'))->toMatchArray(['status' => 'approved', 'approved_by_member_id' => $me->id]);
    $log = AuditLog::where('event', 'expense.approved')->where('mess_id', $mess->id)->sole();
    expect($log->subject_id)->toBe($e->id)->and($log->member_id)->toBe($me->id);

    $this->postJson(messPath($mess, "expenses/{$e->id}/approve"))->assertConflict()->assertJsonPath('code', 'not_pending');
    $this->postJson(messPath($mess, "expenses/{$e->id}/reject"), ['reason' => 'late'])->assertConflict();
});

it('lets the manager reject a pending expense with a reason, and rejected spend does not count', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess);
    $member = MessMember::factory()->for($mess)->create();
    $e = exRecord($mess, $month, $member, ['status' => ExpenseStatus::Pending, 'paid_by' => PaidBy::Cash, 'paid_by_member_id' => null]);

    $this->postJson(messPath($mess, "expenses/{$e->id}/reject"), [])->assertUnprocessable()->assertJsonValidationErrors(['reason']);
    $res = $this->postJson(messPath($mess, "expenses/{$e->id}/reject"), ['reason' => 'not for the mess'])->assertOk();

    expectContractShape($res->json('data'), 'Expense');
    expect($res->json('data.status'))->toBe('rejected');
    expect($e->fresh()->rejected_reason)->toBe('not for the mess');
    $log = AuditLog::where('event', 'expense.rejected')->where('mess_id', $mess->id)->sole();
    expect($log->meta)->toMatchArray(['reason' => 'not for the mess']);

    $this->postJson(messPath($mess, "expenses/{$e->id}/reject"), ['reason' => 'again'])->assertConflict()->assertJsonPath('code', 'not_pending');
    $this->patchJson(messPath($mess, "expenses/{$e->id}"), ['amount_paisa' => 5])->assertConflict()->assertJsonPath('code', 'expense_rejected');
});

it('refuses approve/reject for a non-manager and for an already-approved expense', function () {
    [$mess, $me] = actingAsMember('member');
    $month = exMonth($mess);
    $e = exRecord($mess, $month, $me, ['status' => ExpenseStatus::Pending]);

    $this->postJson(messPath($mess, "expenses/{$e->id}/approve"))->assertForbidden();
    $this->postJson(messPath($mess, "expenses/{$e->id}/reject"), ['reason' => 'x'])->assertForbidden();
    expect($e->fresh()->status)->toBe(ExpenseStatus::Pending);
});

it('returns 409 month_closed when approving in a closed month', function () {
    [$mess, $me] = actingAsMember('manager');
    $month = exMonth($mess, ['status' => 'closed', 'closed_at' => now()]);
    $e = exRecord($mess, $month, $me, ['status' => ExpenseStatus::Pending]);

    $this->postJson(messPath($mess, "expenses/{$e->id}/approve"))->assertConflict()->assertJsonPath('code', 'month_closed');
    $this->postJson(messPath($mess, "expenses/{$e->id}/reject"), ['reason' => 'x'])->assertConflict()->assertJsonPath('code', 'month_closed');
});

// ---------------------------------------------------------------- isolation and roles

it('answers 404 for another mess and for its expenses', function () {
    [$mess, $me] = actingAsMember('manager');
    exMonth($mess);
    $foreign = otherMess();
    $foreignExpense = exForeignExpense($foreign);
    $mine = exRecord($mess, exMonth($mess, ['starts_on' => '2026-12-01', 'ends_on' => '2026-12-31']), $me);

    $this->getJson(messPath($foreign, 'expenses'))->assertNotFound();
    $this->postJson(messPath($foreign, 'expenses'), [])->assertNotFound();
    // An expense id of another mess, reached through my own mess path.
    $this->patchJson(messPath($mess, "expenses/{$foreignExpense->id}"), ['amount_paisa' => 1])->assertNotFound();
    $this->deleteJson(messPath($mess, "expenses/{$foreignExpense->id}"))->assertNotFound();
    $this->postJson(messPath($mess, "expenses/{$foreignExpense->id}/approve"))->assertNotFound();
    $this->postJson(messPath($mess, "expenses/{$foreignExpense->id}/reject"), ['reason' => 'x'])->assertNotFound();
    expect($mine->fresh()->deleted_at)->toBeNull();
});

it('keeps archived members read-only', function () {
    [$mess] = actingAsMember('archived');
    exMonth($mess);

    $this->getJson(messPath($mess, 'expenses'))->assertOk();
    $this->postJson(messPath($mess, 'expenses'), exPayload(exCategory($mess)))->assertForbidden();
});

it('requires login', function () {
    $mess = Mess::factory()->create();
    $this->getJson(messPath($mess, 'expenses'))->assertUnauthorized();
});

function exForeignExpense(?Mess $mess = null): Expense
{
    $mess ??= otherMess();
    $month = Month::factory()->create(["mess_id" => $mess->id]);

    return exRecord($mess, $month, MessMember::factory()->for($mess)->create());
}
