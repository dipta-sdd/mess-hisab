<?php

namespace App\Billing\Balance;

use App\Billing\DoesntPay\Redistributor;
use App\Billing\Dto\BalanceInput;
use App\Billing\Dto\BalanceResult;
use App\Billing\Dto\DoesntPaySplit;
use App\Billing\Dto\GroupBalance;
use App\Billing\Dto\MemberBalance;
use DateTimeImmutable;
use DateTimeZone;

/** CONTRACT §4.7 balances / netting / overdue and §4.8 live doesn't-pay. */
final class BalanceCalculator
{
    public static function calculate(BalanceInput $in): BalanceResult
    {
        $g = fn (array $map, string $group, int $m): int => $map[$group][$m] ?? 0;

        // 1. Total balance before any doesn't-pay.
        $pre = [];
        foreach ($in->memberIds as $m) {
            $pre[$m] = ($in->carryIn[$m] ?? 0)
                + $g($in->payments, 'fixed', $m) + $g($in->ownPocket, 'fixed', $m) + $g($in->ledger, 'fixed', $m) - $g($in->charges, 'fixed', $m)
                + $g($in->payments, 'meals', $m) + $g($in->ownPocket, 'meals', $m) + $g($in->ledger, 'meals', $m) - $g($in->charges, 'meals', $m);
        }

        // 2. Doesn't-pay: every debtor's T is the pre-doesn't-pay total; others exclude all debtors.
        $first = [];
        foreach ($in->doesntPay as $req) {
            $first[$req->debtorMemberId] ??= $req;
        }
        $others = array_values(array_filter($in->activeMemberIds, fn ($id) => ! isset($first[$id])));
        sort($others);

        $dp = array_fill_keys($in->memberIds, 0);
        $splits = [];
        foreach ($in->doesntPay as $req) {
            if ($first[$req->debtorMemberId] !== $req) {
                continue; // duplicate request for the same debtor: first wins
            }
            $t = $pre[$req->debtorMemberId] ?? 0;
            $amount = $t < 0 ? -$t : 0;
            $split = $amount === 0
                ? new DoesntPaySplit($req->debtorMemberId, 0, array_fill_keys($others, 0), 0)
                : Redistributor::splitFor($req->debtorMemberId, $amount, $req->mode, $others, $in->mealWeights, $req->manual);
            $splits[] = $split;
            if (array_key_exists($req->debtorMemberId, $dp)) {
                $dp[$req->debtorMemberId] += $amount;
            }
            foreach ($split->shares as $id => $share) {
                if (array_key_exists($id, $dp)) {
                    $dp[$id] -= $share;
                }
            }
        }

        // 3. Per-member result.
        $members = [];
        foreach ($in->memberIds as $m) {
            $carry = $in->carryIn[$m] ?? 0;
            $fixed = new GroupBalance(
                $carry,
                $g($in->payments, 'fixed', $m),
                $g($in->ownPocket, 'fixed', $m),
                $g($in->ledger, 'fixed', $m),
                $g($in->charges, 'fixed', $m),
                $dp[$m],
                $carry + $g($in->payments, 'fixed', $m) + $g($in->ownPocket, 'fixed', $m) + $g($in->ledger, 'fixed', $m) + $dp[$m] - $g($in->charges, 'fixed', $m),
            );
            $meals = new GroupBalance(
                0,
                $g($in->payments, 'meals', $m),
                $g($in->ownPocket, 'meals', $m),
                $g($in->ledger, 'meals', $m),
                $g($in->charges, 'meals', $m),
                0,
                $g($in->payments, 'meals', $m) + $g($in->ownPocket, 'meals', $m) + $g($in->ledger, 'meals', $m) - $g($in->charges, 'meals', $m),
            );

            $fixedOutstanding = max(0, -$fixed->balancePaisa);
            $required = $in->depositRequired[$m] ?? 0;
            $depositOutstanding = max(0, $required - ($meals->paymentsPaisa + $meals->ownPocketPaisa + $meals->ledgerPaisa + max(0, $fixed->balancePaisa)));

            $members[$m] = new MemberBalance(
                $m,
                $fixed,
                $meals,
                $fixed->balancePaisa + $meals->balancePaisa,
                $fixedOutstanding,
                $required,
                $depositOutstanding,
                self::overdueDays($fixedOutstanding, $in->fixedDeadline, $in->today),
                self::overdueDays($depositOutstanding, $in->depositDeadline, $in->today),
            );
        }

        return new BalanceResult($members, $splits);
    }

    private static function overdueDays(int $outstanding, ?string $deadline, string $today): int
    {
        if ($outstanding <= 0 || $deadline === null) {
            return 0;
        }
        $utc = new DateTimeZone('UTC');
        $d = new DateTimeImmutable($deadline, $utc);
        $t = new DateTimeImmutable($today, $utc);
        if ($t <= $d) {
            return 0;
        }

        return (int) $d->diff($t)->days;
    }
}
