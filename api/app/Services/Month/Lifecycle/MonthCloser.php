<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\LedgerType;
use App\Enums\MonthStatus;
use App\Enums\RecoverableStatus;
use App\Enums\ZeroMealResolution;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Recoverable;
use App\Models\RecoverableShare;
use App\Services\Audit\AuditLogger;
use App\Services\Balance\MonthBalanceService;
use App\Services\Month\Calendar;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Task K: closes a month. Stores the engine's result as ledger rows (source_type `month_close`,
 * source_id = month id), materialises doesn't-pay recoverables, carries uncharged food into the next
 * month and makes sure the next month exists. Everything runs in one transaction, and the balances
 * of every member are asserted to be identical before and after (closing never moves money).
 */
class MonthCloser
{
    public const SOURCE = 'month_close';

    public function __construct(
        private readonly CloseChecker $checker,
        private readonly MonthBalanceService $balances,
        private readonly Calendar $calendar,
        private readonly AuditLogger $audit,
    ) {}

    public function close(Mess $mess, Month $requested, ?ZeroMealResolution $choice, MessMember $by): Month
    {
        return DB::transaction(function () use ($mess, $requested, $choice, $by) {
            // Same lock order as Calendar / expenses: the mess row first, then the month.
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail();
            $month = Month::query()->forMess($mess->id)->whereKey($requested->id)->lockForUpdate()->firstOrFail();
            if ($month->status !== MonthStatus::Open) {
                throw new LifecycleException(__('This month is already closed.'), 'month_closed');
            }

            $ev = $this->checker->evaluate($mess, $month, $choice);
            if (! $ev->canClose()) {
                throw new LifecycleException(__('This month cannot be closed yet.'), 'close_blocked', ['blocks' => $ev->blocks]);
            }
            $snap = $ev->snapshot;

            $now = Carbon::now();
            $rows = [];
            $row = function (int $memberId, LedgerType $type, ?string $group, int $amount, ?string $note, array $meta = []) use ($mess, $month, $by, $now, &$rows) {
                if ($amount === 0) {
                    return;
                }
                $rows[] = [
                    'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $memberId,
                    'group' => $group, 'type' => $type->value, 'amount_paisa' => $amount, 'note' => $note,
                    'source_type' => self::SOURCE, 'source_id' => $month->id,
                    'meta' => $meta === [] ? null : json_encode($meta),
                    'created_by_member_id' => $by->id, 'created_at' => $now,
                ];
            };

            // Per-bill charges, then the meal pool, then rounding per group: Σ = the engine's charged.
            $written = ['fixed' => [], 'meals' => []];
            foreach ($snap->charge->bills as $categoryId => $split) {
                $name = $snap->categories->get($categoryId)?->name ?? 'Bill';
                foreach ($split->shares as $memberId => $share) {
                    $row($memberId, LedgerType::Charge, $split->group->value, -$share, $name, ['category_id' => (int) $categoryId]);
                    $written[$split->group->value][$memberId] = ($written[$split->group->value][$memberId] ?? 0) + $share;
                }
            }
            foreach ($snap->charge->meal->charges as $memberId => $share) {
                $row($memberId, LedgerType::Charge, 'meals', -$share, 'Meal charge', ['kind' => 'meal']);
                $written['meals'][$memberId] = ($written['meals'][$memberId] ?? 0) + $share;
            }
            foreach (['fixed', 'meals'] as $group) {
                foreach ($snap->charge->charged[$group] as $memberId => $charged) {
                    $delta = $charged - ($written[$group][$memberId] ?? 0);
                    $row($memberId, LedgerType::Rounding, $group, -$delta, 'Rounding');
                    $written[$group][$memberId] = ($written[$group][$memberId] ?? 0) + $delta;
                }
            }
            foreach (['fixed', 'meals'] as $group) {
                foreach ($snap->charge->charged[$group] as $memberId => $charged) {
                    if (($written[$group][$memberId] ?? 0) !== $charged) {
                        throw new LogicException("Close rows do not add up to the engine's charge for member {$memberId} ({$group}).");
                    }
                }
            }

            // Doesn't-pay: debtor gets +|T|, the others -share (fixed side). Close is blocked on a mismatch.
            foreach ($snap->balances->doesntPay as $split) {
                $debtor = $snap->members->get($split->debtorMemberId)?->display_name ?? 'a member';
                $row($split->debtorMemberId, LedgerType::DoesntPayOut, 'fixed', $split->amountPaisa, 'Unpaid share passed to others');
                foreach ($split->shares as $memberId => $share) {
                    $row($memberId, LedgerType::DoesntPayIn, 'fixed', -$share, "Share of {$debtor}'s unpaid bill", ['debtor_member_id' => $split->debtorMemberId]);
                }
            }

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('ledger_entries')->insert($chunk);
            }

            $this->materialiseRecoverables($month, $snap->balances->doesntPay);

            $carryOut = $ev->resolution === ZeroMealResolution::Carry ? $snap->charge->meal->carryOutPaisa : 0;
            $month->forceFill([
                'status' => MonthStatus::Closed,
                'closed_at' => $now,
                'closed_by_member_id' => $by->id,
                'food_carry_out_paisa' => $carryOut,
            ])->save();

            $next = $this->nextMonth($mess, $month);
            if ((int) $next->food_carry_in_paisa !== $carryOut) {
                $next->forceFill(['food_carry_in_paisa' => $carryOut])->save();
            }

            $after = $this->balances->allSnapshots($mess)[0]->totals();
            if ($after !== $ev->totalsBefore) {
                throw new LogicException('Closing the month changed member balances.');
            }

            $this->audit->log('month.closed', $month, [], ['status' => 'closed'], [
                'rows_written' => count($rows),
                'zero_meal_resolution' => $ev->resolution?->value,
                'next_month_id' => $next->id,
                'totals' => $after,
            ]);

            return $month->fresh();
        });
    }

    /** @param list<\App\Billing\Dto\DoesntPaySplit> $splits */
    private function materialiseRecoverables(Month $month, array $splits): void
    {
        $bySplit = [];
        foreach ($splits as $split) {
            $bySplit[$split->debtorMemberId] = $split;
        }

        $recoverables = Recoverable::query()->forMess($month->mess_id)->where('month_id', $month->id)
            ->where('status', RecoverableStatus::Pending->value)->whereNull('undone_at')->orderBy('id')->get();
        $seen = [];
        foreach ($recoverables as $r) {
            $split = $bySplit[$r->debtor_member_id] ?? null;
            if ($split === null || isset($seen[$r->debtor_member_id])) {
                // A duplicate request for the same debtor is ignored by the engine (first wins): undo it.
                $r->forceFill(['status' => RecoverableStatus::Undone, 'undone_at' => Carbon::now()])->save();

                continue;
            }
            $seen[$r->debtor_member_id] = true;

            $r->forceFill([
                'amount_paisa' => $split->amountPaisa,
                'status' => $split->amountPaisa > 0 ? RecoverableStatus::Open : RecoverableStatus::Settled,
            ])->save();

            $existing = RecoverableShare::query()->forMess($month->mess_id)->where('recoverable_id', $r->id)->get()->keyBy('member_id');
            foreach ($split->shares as $memberId => $share) {
                $existing->get($memberId)?->forceFill(['amount_paisa' => $share])->save()
                    ?? RecoverableShare::query()->create([
                        'mess_id' => $month->mess_id, 'recoverable_id' => $r->id, 'member_id' => $memberId, 'amount_paisa' => $share,
                    ]);
            }
            // A manual share for someone who is not in the split any more is dropped to 0.
            foreach ($existing as $memberId => $share) {
                if (! array_key_exists($memberId, $split->shares)) {
                    $share->forceFill(['amount_paisa' => 0])->save();
                }
            }
        }
    }

    /** The month that starts the day after $month ends; created (open) if missing. */
    private function nextMonth(Mess $mess, Month $month): Month
    {
        $this->calendar->currentMonth($mess);
        $start = $month->ends_on->copy()->addDay()->toDateString();

        return Month::query()->forMess($mess->id)->whereDate('starts_on', $start)->first()
            ?? $this->calendar->monthFor($mess, $start);
    }
}
