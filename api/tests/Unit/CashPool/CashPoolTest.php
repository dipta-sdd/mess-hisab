<?php

use App\Enums\ExpenseStatus;
use App\Enums\LedgerType;
use App\Enums\PaidBy;
use App\Models\Expense;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Recoverable;
use App\Models\Payment;
use App\Models\RecoverableRepayment;
use Illuminate\Foundation\Testing\RefreshDatabase;

// Unit/ is DB-free by default; the pool is computed from rows, so this file opts in.
uses(RefreshDatabase::class);

function gpPoolMess(): array
{
    $mess = Mess::factory()->create();
    $month = Month::factory()->create(['mess_id' => $mess->id]);

    return [$mess, $month];
}

it('is zero for an empty mess', function () {
    [$mess] = gpPoolMess();
    expect(gpPoolBalance($mess))->toBe(0);
});

function gpPoolBalance(Mess $mess): int
{
    return App\Services\CashPool\CashPool::balance($mess);
}

it('adds payments', function () {
    [$mess, $month] = gpPoolMess();
    Payment::factory()->count(2)->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 25000]);

    expect(gpPoolBalance($mess))->toBe(50000);
});

it('adds recoverable repayments', function () {
    [$mess, $month] = gpPoolMess();
    RecoverableRepayment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'recoverable_id' => Recoverable::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id]), 'amount_paisa' => 12000]);

    expect(gpPoolBalance($mess))->toBe(12000);
});

it('subtracts only approved cash expenses', function () {
    [$mess, $month] = gpPoolMess();
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 100000]);
    $member = MessMember::factory()->create(['mess_id' => $mess->id]);
    $base = ['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 10000, 'created_by_member_id' => $member->id];

    Expense::factory()->create($base + ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null]);                                      // counts
    Expense::factory()->create($base + ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null, 'status' => ExpenseStatus::Pending]); // ignored
    Expense::factory()->create($base + ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null, 'status' => ExpenseStatus::Rejected]); // ignored
    Expense::factory()->create($base + ['paid_by' => PaidBy::Member]);                                                                 // own pocket: ignored
    Expense::factory()->create($base + ['paid_by' => PaidBy::Cash, 'paid_by_member_id' => null])->delete();                           // soft deleted: ignored

    expect(gpPoolBalance($mess))->toBe(90000);
});

it('subtracts the absolute value of final payouts and ignores other ledger rows', function () {
    [$mess, $month] = gpPoolMess();
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 100000]);
    $base = ['mess_id' => $mess->id, 'month_id' => $month->id];

    LedgerEntry::factory()->create($base + ['type' => LedgerType::FinalPayout, 'amount_paisa' => -30000]);
    LedgerEntry::factory()->create($base + ['type' => LedgerType::Adjustment, 'amount_paisa' => -5000]);
    LedgerEntry::factory()->create($base + ['type' => LedgerType::Opening, 'amount_paisa' => 7000]);
    LedgerEntry::factory()->create($base + ['type' => LedgerType::Charge, 'amount_paisa' => -9000]);

    expect(gpPoolBalance($mess))->toBe(70000);
});

it('ignores deleted payments and combines every term', function () {
    [$mess, $month] = gpPoolMess();
    $member = MessMember::factory()->create(['mess_id' => $mess->id]);
    $base = ['mess_id' => $mess->id, 'month_id' => $month->id];
    Payment::factory()->create($base + ['amount_paisa' => 80000]);
    Payment::factory()->create($base + ['amount_paisa' => 5000])->delete();
    RecoverableRepayment::factory()->create($base + ['recoverable_id' => Recoverable::factory()->create($base), 'amount_paisa' => 20000]);
    Expense::factory()->create($base + ['created_by_member_id' => $member->id, 'amount_paisa' => 15000, 'paid_by' => PaidBy::Cash, 'paid_by_member_id' => null]);
    LedgerEntry::factory()->create($base + ['type' => LedgerType::FinalPayout, 'amount_paisa' => -25000]);

    expect(gpPoolBalance($mess))->toBe(80000 + 20000 - 15000 - 25000);
});

it('does not count another mess', function () {
    [$mess, $month] = gpPoolMess();
    [$other, $otherMonth] = gpPoolMess();
    Payment::factory()->create(['mess_id' => $other->id, 'month_id' => $otherMonth->id, 'amount_paisa' => 77000]);
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 1000]);

    expect(gpPoolBalance($mess))->toBe(1000);
});
