<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\DoesntPayMode;
use App\Enums\MonthStatus;
use App\Enums\RecoverableStatus;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Recoverable;
use App\Models\RecoverableShare;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Task K: "X doesn't pay" requests of an OPEN month. Only the request is saved here (a `pending`
 * recoverable, plus the typed amounts for `manual`); the amounts are computed live by the engine and
 * written at close. Undoing a request just marks it `undone`.
 */
class DoesntPayService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** @param list<array{member_id: int, amount_paisa: int}> $manual */
    public function create(Mess $mess, Month $requested, int $debtorId, DoesntPayMode $mode, array $manual, MessMember $by): Recoverable
    {
        return DB::transaction(function () use ($mess, $requested, $debtorId, $mode, $manual, $by) {
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail();
            $month = $this->openMonth($mess, $requested);

            $active = MessMember::query()->forMess($mess->id)->activeIn($month)->pluck('id')->map(fn ($id) => (int) $id)->all();
            if (! in_array($debtorId, $active, true)) {
                throw new LifecycleException(__('That member is not part of this month.'), 'member_not_active');
            }
            $exists = Recoverable::query()->forMess($mess->id)->where('month_id', $month->id)
                ->where('debtor_member_id', $debtorId)->where('status', '!=', RecoverableStatus::Undone->value)->exists();
            if ($exists) {
                throw new LifecycleException(__('This member already has an unpaid-share request in this month.'), 'already_doesnt_pay');
            }

            $typed = [];
            if ($mode === DoesntPayMode::Manual) {
                foreach ($manual as $i => $item) {
                    $id = (int) $item['member_id'];
                    if ($id === $debtorId || ! in_array($id, $active, true)) {
                        throw ValidationException::withMessages(["manual.{$i}.member_id" => [__('Pick another member who is part of this month.')]]);
                    }
                    if (isset($typed[$id])) {
                        throw ValidationException::withMessages(["manual.{$i}.member_id" => [__('This member is listed twice.')]]);
                    }
                    $typed[$id] = (int) $item['amount_paisa'];
                }
                if ($typed === []) {
                    throw ValidationException::withMessages(['manual' => [__('Give the amount each member takes over.')]]);
                }
            } elseif ($manual !== []) {
                throw ValidationException::withMessages(['manual' => [__('Typed amounts are only for the manual mode.')]]);
            }

            $recoverable = Recoverable::create([
                'mess_id' => $mess->id, 'month_id' => $month->id, 'debtor_member_id' => $debtorId,
                'mode' => $mode, 'status' => RecoverableStatus::Pending, 'amount_paisa' => null,
                'repaid_paisa' => 0, 'created_by_member_id' => $by->id,
            ]);
            ksort($typed);
            foreach ($typed as $memberId => $amount) {
                RecoverableShare::create([
                    'mess_id' => $mess->id, 'recoverable_id' => $recoverable->id, 'member_id' => $memberId,
                    'manual_amount_paisa' => $amount, 'amount_paisa' => null,
                ]);
            }
            $this->audit->log('doesnt_pay.set', $recoverable, [], ['debtor_member_id' => $debtorId, 'mode' => $mode->value, 'manual' => $typed]);

            return $recoverable->load('shares');
        });
    }

    public function undo(Mess $mess, Month $requested, Recoverable $recoverable): void
    {
        DB::transaction(function () use ($mess, $requested, $recoverable) {
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail();
            $month = $this->openMonth($mess, $requested);
            $locked = Recoverable::query()->forMess($mess->id)->whereKey($recoverable->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->month_id === $month->id, 404);
            if ($locked->status !== RecoverableStatus::Pending) {
                throw new LifecycleException(__('Only a request that is still pending can be undone.'), 'not_pending');
            }

            $locked->forceFill(['status' => RecoverableStatus::Undone, 'undone_at' => Carbon::now()])->save();
            $this->audit->log('doesnt_pay.undone', $locked, ['status' => 'pending'], ['status' => 'undone']);
        });
    }

    private function openMonth(Mess $mess, Month $requested): Month
    {
        $month = Month::query()->forMess($mess->id)->whereKey($requested->id)->lockForUpdate()->firstOrFail();
        if ($month->status !== MonthStatus::Open) {
            throw new LifecycleException(__('This month is closed.'), 'month_closed');
        }

        return $month;
    }
}
