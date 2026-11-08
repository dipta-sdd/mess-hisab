<?php

namespace App\Services\Sms;

use App\Jobs\Sms\SendSms;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\Payment;
use App\Rules\BdMobile;
use App\Services\Balance\MonthBalanceService;
use App\Support\Money;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Texts members about their money: a payment recorded, changed or cancelled, and a closed month.
 * English only, one amount per text. Only members whose user has a verified phone are texted; the send
 * is queued, so a gateway problem never touches the payment or the close.
 */
class MemberNotifier
{
    public function __construct(private readonly MonthBalanceService $balances) {}

    public function paymentRecorded(Payment $payment): void
    {
        $this->safely(fn () => $this->text($payment->member_id, 'payment_received', [
            'amount' => Money::tk($payment->amount_paisa),
            'date' => $this->day($payment->paid_on),
        ]));
    }

    public function paymentCancelled(int $memberId, int $amountPaisa, CarbonInterface|string $paidOn): void
    {
        $this->safely(fn () => $this->text($memberId, 'payment_cancelled', [
            'amount' => Money::tk($amountPaisa),
            'date' => $this->day($paidOn),
        ]));
    }

    /** @param  array{amount_paisa: int, paid_on: string}  $before */
    public function paymentChanged(Payment $payment, array $before): void
    {
        $this->safely(function () use ($payment, $before) {
            $old = $this->day($before['paid_on']);
            $new = $this->day($payment->paid_on);

            $this->text($payment->member_id, $old === $new ? 'payment_changed' : 'payment_changed_date', [
                'amount' => Money::tk($payment->amount_paisa),
                'date' => $new,
                'old_date' => $old,
            ]);
        });
    }

    /**
     * One text per active member with the month's final balance (below 0 owes, above 0 gets back).
     * An archived member is only texted when they still owe or are owed something.
     */
    public function monthClosed(Month $month): void
    {
        $this->safely(function () use ($month) {
            $snapshot = $this->balances->snapshot($month);
            $totals = $snapshot->totals();
            $name = $month->starts_on->format('F');
            $ids = array_unique([...$snapshot->activeMemberIds, ...array_keys(array_filter($totals))]);
            $members = MessMember::query()->with('user')->whereIn('id', $ids)->get();

            foreach ($members as $member) {
                $balance = $totals[$member->id] ?? 0;
                $this->safely(fn () => $this->send($member, $balance < 0 ? 'month_owes' : ($balance > 0 ? 'month_credit' : 'month_settled'), [
                    'month' => $name,
                    'amount' => Money::tk(abs($balance)),
                ], $balance !== 0));
            }
        });
    }

    /** A changed payment: a new member means the old one is told it was cancelled and the new one that it arrived. */
    public function paymentUpdated(Payment $payment, array $before): void
    {
        if ($payment->member_id !== $before['member_id']) {
            $this->paymentCancelled($before['member_id'], $before['amount_paisa'], $before['paid_on']);
            $this->paymentRecorded($payment);
        } elseif ($payment->amount_paisa !== $before['amount_paisa'] || $payment->paid_on->toDateString() !== $before['paid_on']) {
            $this->paymentChanged($payment, $before);
        }
    }

    private function text(int $memberId, string $key, array $params): void
    {
        $this->send(MessMember::query()->with('user')->find($memberId), $key, $params);
    }

    private function send(?MessMember $member, string $key, array $params, bool $evenIfArchived = false): void
    {
        $user = $member?->user;
        if ($member === null || ($member->isArchived() && ! $evenIfArchived) || $user === null || ! $user->hasVerifiedPhone()) {
            return;
        }

        SendSms::dispatch(BdMobile::normalize($user->phone), __('sms.'.$key, $params, 'en'));
    }

    /** A text must never undo or fail a payment or a close that is already saved. */
    private function safely(callable $work): void
    {
        try {
            $work();
        } catch (Throwable $e) {
            Log::warning('Member SMS skipped ('.$e::class.'): '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);
        }
    }

    private function day(CarbonInterface|string $date): string
    {
        return Carbon::parse($date)->format('j M');
    }
}
