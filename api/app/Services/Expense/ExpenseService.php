<?php

namespace App\Services\Expense;

use App\Enums\ExpenseStatus;
use App\Enums\PaidBy;
use App\Models\Expense;
use App\Models\Mess;
use App\Models\MessMember;
use App\Policies\ExpensePolicy;
use App\Services\Audit\AuditLogger;
use App\Services\CashPool\CashPool;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use App\Services\Payment\PaymentMonth;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * All expense writes. Every write runs in a transaction that first locks the mess row, so two
 * concurrent cash expenses (or an approve racing an edit) are serialised and the cash pool can
 * never go negative (CONTRACT §3).
 *
 * Short cash (PROJECT §4): a `cash` expense that the pool cannot cover becomes the manager's own
 * money, WHOLE (the spec's example: buys 500 with 200 in the pool is recorded as the manager's
 * own money; it is not split into 200 cash + 300 own). Only approved cash expenses reduce the
 * pool, so a pending cash expense is checked again when it is approved.
 */
class ExpenseService
{
    public const WARNING_SHORT_CASH = 'short_cash_converted';

    /** @return array{expense: Expense, warnings: list<string>} */
    public function create(Mess $mess, MessMember $actor, array $data): array
    {
        return DB::transaction(function () use ($mess, $actor, $data) {
            $mess = $this->lockMess($mess);
            $isManager = $actor->isStaff(); // admin has the manager's edit powers; cash stays the manager's

            $paidBy = PaidBy::from($data['paid_by']);
            $paidByMemberId = $this->resolvePayer($isManager, $actor, $paidBy, $data['paid_by_member_id'] ?? null);

            ['month' => $month, 'is_late' => $isLate] = $this->assign($mess, $data['spent_on']);

            $pending = $mess->approval_required && ! $isManager;

            $expense = new Expense([
                'month_id' => $month->id,
                'category_id' => $data['category_id'],
                'amount_paisa' => $data['amount_paisa'],
                'spent_on' => $data['spent_on'],
                'note' => $data['note'] ?? null,
                'paid_by' => $paidBy,
                'paid_by_member_id' => $paidByMemberId,
                'status' => $pending ? ExpenseStatus::Pending : ExpenseStatus::Approved,
                'approved_by_member_id' => $pending ? null : $actor->id,
                'approved_at' => $pending ? null : now(),
                'is_late' => $isLate,
                'short_cash_converted' => false,
                'is_self_recorded' => $isManager,
                'created_by_member_id' => $actor->id,
            ]);

            $warnings = [];
            if (! $pending && $this->convertIfShort($mess, $expense, alreadyCounted: 0)) {
                $warnings[] = self::WARNING_SHORT_CASH;
            }

            $expense->save();

            return ['expense' => $expense->refresh(), 'warnings' => $warnings];
        });
    }

    public function update(Mess $mess, MessMember $actor, Expense $expense, array $data): Expense
    {
        return DB::transaction(function () use ($mess, $actor, $expense, $data) {
            $mess = $this->lockMess($mess);
            $expense = Expense::query()->lockForUpdate()->findOrFail($expense->id);
            $isManager = $actor->isStaff(); // admin has the manager's edit powers; cash stays the manager's

            $this->assertCanModify($mess, $actor, $expense, $isManager, editing: true);

            // The cash this expense already takes out of the pool (so an edit doesn't count it twice).
            $alreadyCounted = $this->poolImpact($expense);

            $paidBy = array_key_exists('paid_by', $data) ? PaidBy::from($data['paid_by']) : $expense->paid_by;
            $payerTouched = array_key_exists('paid_by', $data) || array_key_exists('paid_by_member_id', $data);
            if ($payerTouched) {
                $requested = array_key_exists('paid_by_member_id', $data)
                    ? $data['paid_by_member_id']
                    : ($paidBy === PaidBy::Member && $expense->paid_by === PaidBy::Member ? $expense->paid_by_member_id : null);
                $expense->paid_by = $paidBy;
                $expense->paid_by_member_id = $this->resolvePayer($isManager, $actor, $paidBy, $requested, updating: true);
                $expense->short_cash_converted = false;
            } elseif (! $isManager && ($expense->paid_by !== PaidBy::Member || $expense->paid_by_member_id !== $actor->id)) {
                // A member may only touch money they paid themselves, even when not re-sending the payer
                // (e.g. a cash expense they recorded while they were the manager).
                throw ValidationException::withMessages(['paid_by' => [__('Only the manager can change an expense paid from mess cash or by someone else.')]]);
            }

            foreach (['category_id', 'amount_paisa', 'note'] as $field) {
                if (array_key_exists($field, $data)) {
                    $expense->{$field} = $data[$field];
                }
            }

            if (array_key_exists('spent_on', $data) && $data['spent_on'] !== $expense->spent_on->toDateString()) {
                ['month' => $month, 'is_late' => $isLate] = $this->assign($mess, $data['spent_on']);
                $expense->spent_on = $data['spent_on'];
                $expense->month_id = $month->id;
                $expense->is_late = $isLate;
            }

            // Re-run the short-cash rule when the amount or payer changed (CONTRACT §6 Task E).
            $moneyChanged = $payerTouched || array_key_exists('amount_paisa', $data);
            if ($moneyChanged && $expense->status === ExpenseStatus::Approved) {
                $this->convertIfShort($mess, $expense, $alreadyCounted);
            }

            $expense->save();

            return $expense->refresh();
        });
    }

    public function delete(Mess $mess, MessMember $actor, Expense $expense): void
    {
        DB::transaction(function () use ($mess, $actor, $expense) {
            $mess = $this->lockMess($mess);
            $expense = Expense::query()->lockForUpdate()->findOrFail($expense->id);

            $this->assertCanModify($mess, $actor, $expense, $actor->id === $mess->manager_member_id, editing: false);

            $expense->delete();
        });
    }

    public function approve(Mess $mess, MessMember $actor, Expense $expense): Expense
    {
        return DB::transaction(function () use ($mess, $actor, $expense) {
            $mess = $this->lockMess($mess);
            $expense = $this->lockPending($expense);
            $before = $expense->only(['status', 'paid_by', 'paid_by_member_id', 'short_cash_converted']);

            // Only approved cash expenses reduce the pool, so check now (it was not counted while pending).
            $expense->status = ExpenseStatus::Approved;
            $this->convertIfShort($mess, $expense, alreadyCounted: 0);

            $expense->approved_by_member_id = $actor->id;
            $expense->approved_at = now();
            $expense->saveQuietly();

            app(AuditLogger::class)->log('expense.approved', $expense, $this->audit($before), $this->audit($expense->only(array_keys($before))));

            return $expense->refresh();
        });
    }

    public function reject(Mess $mess, MessMember $actor, Expense $expense, string $reason): Expense
    {
        return DB::transaction(function () use ($mess, $actor, $expense, $reason) {
            $this->lockMess($mess);
            $expense = $this->lockPending($expense);

            $expense->status = ExpenseStatus::Rejected;
            $expense->rejected_reason = $reason;
            $expense->saveQuietly();

            app(AuditLogger::class)->log('expense.rejected', $expense, ['status' => ExpenseStatus::Pending->value], ['status' => ExpenseStatus::Rejected->value], ['reason' => $reason]);

            return $expense->refresh();
        });
    }

    // ---------------------------------------------------------------------------------------

    private function lockMess(Mess $mess): Mess
    {
        return Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail();
    }

    private function lockPending(Expense $expense): Expense
    {
        $expense = Expense::query()->lockForUpdate()->findOrFail($expense->id);
        PaymentMonth::assertOpen($expense->month);

        if ($expense->status !== ExpenseStatus::Pending) {
            throw $this->conflict('not_pending', __('Only a pending expense can be approved or rejected.'));
        }

        return $expense;
    }

    /** @return array{month: \App\Models\Month, is_late: bool} */
    private function assign(Mess $mess, string $date): array
    {
        try {
            return app(Calendar::class)->assignMonth($mess, $date);
        } catch (CalendarException $e) {
            throw ValidationException::withMessages(['spent_on' => [$e->getMessage()]]);
        }
    }

    /**
     * Who may change/delete this expense, and when.
     * Manager: any time the expense's month is open. Owner: while pending, or (approval off) while
     * the month is open. Anyone else: 403.
     */
    private function assertCanModify(Mess $mess, MessMember $actor, Expense $expense, bool $isManager, bool $editing): void
    {
        abort_unless((new ExpensePolicy)->modify($actor, $expense), 403, __('Only the owner or the manager can change this expense.'));

        PaymentMonth::assertOpen($expense->month);

        if ($editing && $expense->status === ExpenseStatus::Rejected) {
            throw $this->conflict('expense_rejected', __('A rejected expense cannot be edited.'));
        }

        if (! $isManager && $mess->approval_required && $expense->status === ExpenseStatus::Approved) {
            throw $this->conflict('already_approved', __('This expense is already approved; only the manager can change it.'));
        }
    }

    /** Paisa this expense currently takes from the cash pool (0 unless approved + cash). */
    private function poolImpact(Expense $expense): int
    {
        return $expense->status === ExpenseStatus::Approved && $expense->paid_by === PaidBy::Cash
            ? $expense->amount_paisa
            : 0;
    }

    /**
     * Validate who paid. Members can only record their own pocket; the manager can record anything.
     * Returns the paid_by_member_id to store (null for cash).
     */
    private function resolvePayer(bool $isManager, MessMember $actor, PaidBy $paidBy, ?int $requested, bool $updating = false): ?int
    {
        if ($paidBy === PaidBy::Cash) {
            if (! $isManager) {
                throw ValidationException::withMessages(['paid_by' => [__('Only the manager can record an expense paid from mess cash.')]]);
            }
            if ($requested !== null && ! $updating) {
                throw ValidationException::withMessages(['paid_by_member_id' => [__('Leave this empty when paid from mess cash.')]]);
            }

            return null;
        }

        // Nobody named: the person recording paid (the manager is also a normal member).
        $payer = $requested ?? $actor->id;
        if (! $isManager && $payer !== $actor->id) {
            throw ValidationException::withMessages(['paid_by_member_id' => [__('You can only record expenses you paid yourself.')]]);
        }

        return $payer;
    }

    /**
     * If $expense is an approved cash expense the pool can't cover, turn the whole expense into the
     * manager's own money. $alreadyCounted is what this expense already takes from the pool.
     * Returns whether it was converted. Caller holds the mess lock.
     */
    private function convertIfShort(Mess $mess, Expense $expense, int $alreadyCounted): bool
    {
        if ($expense->paid_by !== PaidBy::Cash) {
            return false;
        }

        $available = CashPool::balance($mess) + $alreadyCounted;
        if ($expense->amount_paisa <= $available) {
            return false;
        }

        $expense->paid_by = PaidBy::Member;
        $expense->paid_by_member_id = $mess->manager_member_id;
        $expense->short_cash_converted = true;

        return true;
    }

    private function conflict(string $code, string $message): HttpResponseException
    {
        return new HttpResponseException(response()->json(['message' => $message, 'code' => $code], 409));
    }

    private function audit(array $values): array
    {
        return array_map(fn ($v) => $v instanceof \BackedEnum ? $v->value : $v, $values);
    }
}
