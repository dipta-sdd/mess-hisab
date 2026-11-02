<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\LedgerType;
use App\Enums\MonthStatus;
use App\Enums\RecoverableStatus;
use App\Models\ChargeOverride;
use App\Models\Expense;
use App\Models\LedgerEntry;
use App\Models\MealEntry;
use App\Models\MemberMonthSetting;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\MonthBill;
use App\Models\Payment;
use App\Models\Recoverable;
use App\Models\RecoverableRepayment;
use App\Models\RecoverableShare;
use App\Services\Audit\AuditLogger;
use App\Services\Balance\MonthBalanceService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Task K: reopens the LATEST closed month. Deletes exactly the rows its close wrote (source `month_close`),
 * puts its doesn't-pay recoverables back to `pending`, and removes the (empty) month that close opened.
 * Nothing else is touched. Balances of every member must be unchanged by the reopen itself.
 */
class MonthReopener
{
    public function __construct(
        private readonly MonthBalanceService $balances,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Read-only. Simulates the reopen inside a rolled-back transaction.
     *
     * @return array{month_id: int, can_reopen: bool, blocks: list<array{code: string, data: array<string,mixed>}>, members: list<array<string,mixed>>, rows_to_delete: int, next_month: array<string,mixed>|null}
     */
    public function preview(Mess $mess, Month $month): array
    {
        $blocks = $this->blocks($mess, $month);
        $before = $this->totals($mess);
        $rows = $this->closeRows($mess, $month)->count();
        $next = $this->nextMonth($mess, $month);
        $after = null;

        if ($blocks === []) {
            DB::beginTransaction();
            try {
                $this->apply($mess, $month, null);
                $after = $this->totals($mess);
            } finally {
                DB::rollBack();
            }
        }

        $members = MessMember::query()->forMess($mess->id)->orderBy('id')->get();
        $out = [];
        foreach ($members as $m) {
            $b = $before[$m->id] ?? 0;
            $a = $after[$m->id] ?? null;
            $out[] = [
                'member_id' => $m->id,
                'display_name' => $m->display_name,
                'before_paisa' => $b,
                'after_paisa' => $a,
                'change_paisa' => $a === null ? null : $a - $b,
            ];
        }

        return [
            'month_id' => $month->id,
            'can_reopen' => $blocks === [],
            'blocks' => $blocks,
            'members' => $out,
            'rows_to_delete' => $rows,
            'next_month' => $next === null ? null : [
                'id' => $next->id,
                'will_be_deleted' => $blocks === [] && $this->isLastMonth($mess, $next) && ! $this->hasData($mess, $next),
            ],
        ];
    }

    public function reopen(Mess $mess, Month $requested, MessMember $by): Month
    {
        return DB::transaction(function () use ($mess, $requested, $by) {
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail();
            $month = Month::query()->forMess($mess->id)->whereKey($requested->id)->lockForUpdate()->firstOrFail();

            $blocks = $this->blocks($mess, $month);
            if ($blocks !== []) {
                $first = $blocks[0];
                throw new LifecycleException($this->message($first['code']), $first['code'], ['blocks' => $blocks]);
            }

            $before = $this->totals($mess);
            $rows = $this->closeRows($mess, $month)->count();
            $this->apply($mess, $month, $by);
            $after = $this->totals($mess);
            if ($after !== $before) {
                throw new LifecycleException('Reopening would change balances; the stored month no longer matches its raw data.', 'balances_changed');
            }

            $this->audit->log('month.reopened', $month, ['status' => 'closed'], ['status' => 'open'], ['rows_deleted' => $rows]);

            return $month->fresh();
        });
    }

    /** @return list<array{code: string, data: array<string,mixed>}> */
    public function blocks(Mess $mess, Month $month): array
    {
        if ($month->status !== MonthStatus::Closed) {
            return [['code' => 'month_not_closed', 'data' => ['month_id' => $month->id]]];
        }

        $blocks = [];
        $later = Month::query()->forMess($mess->id)->where('status', MonthStatus::Closed->value)
            ->where('starts_on', '>', $month->starts_on->toDateString())->orderBy('starts_on')->pluck('id')->all();
        if ($later !== []) {
            $blocks[] = ['code' => 'not_latest_closed', 'data' => ['later_month_ids' => array_map('intval', $later)]];
        }

        $closeIds = $this->closeRows($mess, $month)->pluck('id');
        $payouts = LedgerEntry::query()->forMess($mess->id)->where('type', LedgerType::FinalPayout->value);
        if ($closeIds->isNotEmpty()) {
            $payouts->where('id', '>', $closeIds->max());
        } elseif ($month->closed_at !== null) {
            $payouts->where('created_at', '>=', $month->closed_at);
        } else {
            $payouts->whereRaw('1 = 0');
        }
        if (($ids = $payouts->orderBy('id')->pluck('id')->all()) !== []) {
            $blocks[] = ['code' => 'payout_after_close', 'data' => ['ledger_entry_ids' => array_map('intval', $ids)]];
        }

        if ($month->closed_at !== null) {
            $archived = MessMember::query()->forMess($mess->id)->whereNotNull('archived_at')
                ->where('archived_at', '>', $month->closed_at)->orderBy('id')->pluck('id')->all();
            if ($archived !== []) {
                $blocks[] = ['code' => 'archive_after_close', 'data' => ['member_ids' => array_map('intval', $archived)]];
            }
        }

        $repaid = Recoverable::query()->forMess($mess->id)->where('month_id', $month->id)
            ->whereIn('id', RecoverableRepayment::query()->forMess($mess->id)->select('recoverable_id'))->pluck('id')->all();
        if ($repaid !== []) {
            $blocks[] = ['code' => 'recoverable_repaid', 'data' => ['recoverable_ids' => array_map('intval', $repaid)]];
        }

        return $blocks;
    }

    private function message(string $code): string
    {
        return match ($code) {
            'month_not_closed' => 'This month is not closed.',
            'not_latest_closed' => 'Only the latest closed month can be reopened.',
            'payout_after_close' => 'A final payout was made after this month closed.',
            'archive_after_close' => 'A member was archived after this month closed.',
            'recoverable_repaid' => 'A repayment was already recorded against this month\'s unpaid share.',
            default => 'This month cannot be reopened.',
        };
    }

    /** The undo itself. Caller holds the locks and the transaction. */
    private function apply(Mess $mess, Month $month, ?MessMember $by): void
    {
        $this->closeRows($mess, $month)->delete();

        $recoverables = Recoverable::query()->forMess($mess->id)->where('month_id', $month->id)
            ->whereIn('status', [RecoverableStatus::Open->value, RecoverableStatus::Settled->value])->get();
        foreach ($recoverables as $r) {
            $r->forceFill(['status' => RecoverableStatus::Pending, 'amount_paisa' => null, 'repaid_paisa' => 0])->save();
            RecoverableShare::query()->forMess($mess->id)->where('recoverable_id', $r->id)->get()->each(function (RecoverableShare $s) {
                if ($s->manual_amount_paisa === null) {
                    $s->delete(); // equal / by_meals shares are only results of the close; manual ones are input
                } else {
                    $s->forceFill(['amount_paisa' => null])->save();
                }
            });
        }

        $next = $this->nextMonth($mess, $month);
        $month->forceFill([
            'status' => MonthStatus::Open,
            'closed_at' => null,
            'closed_by_member_id' => null,
            'reopened_at' => Carbon::now(),
            'food_carry_out_paisa' => 0,
        ])->save();

        if ($next !== null) {
            if ($this->isLastMonth($mess, $next) && ! $this->hasData($mess, $next)) {
                $next->delete();
            } elseif ((int) $next->food_carry_in_paisa !== 0) {
                $next->forceFill(['food_carry_in_paisa' => 0])->save();
            }
        }
    }

    /** @return \Illuminate\Database\Eloquent\Builder<LedgerEntry> */
    private function closeRows(Mess $mess, Month $month)
    {
        return LedgerEntry::query()->forMess($mess->id)->where('source_type', MonthCloser::SOURCE)->where('source_id', $month->id);
    }

    private function nextMonth(Mess $mess, Month $month): ?Month
    {
        return Month::query()->forMess($mess->id)->whereDate('starts_on', $month->ends_on->copy()->addDay()->toDateString())->first();
    }

    private function isLastMonth(Mess $mess, Month $month): bool
    {
        return ! Month::query()->forMess($mess->id)->where('starts_on', '>', $month->starts_on->toDateString())->exists();
    }

    /** Anything at all recorded against the month (deleted payments / expenses still count: they hold a foreign key). */
    private function hasData(Mess $mess, Month $month): bool
    {
        $id = $month->id;
        $m = $mess->id;

        return Payment::query()->forMess($m)->withTrashed()->where('month_id', $id)->exists()
            || Expense::query()->forMess($m)->withTrashed()->where('month_id', $id)->exists()
            || MealEntry::query()->forMess($m)->where('month_id', $id)->exists()
            || LedgerEntry::query()->forMess($m)->where('month_id', $id)->exists()
            || Recoverable::query()->forMess($m)->where('month_id', $id)->exists()
            || RecoverableRepayment::query()->forMess($m)->where('month_id', $id)->exists()
            || MonthBill::query()->forMess($m)->where('month_id', $id)->exists()
            || ChargeOverride::query()->forMess($m)->where('month_id', $id)->exists()
            || MemberMonthSetting::query()->forMess($m)->where('month_id', $id)->exists();
    }

    /** @return array<int,int> */
    private function totals(Mess $mess): array
    {
        return $this->balances->allSnapshots($mess)[0]->totals();
    }
}
