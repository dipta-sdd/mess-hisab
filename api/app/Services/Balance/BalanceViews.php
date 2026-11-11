<?php

namespace App\Services\Balance;

use App\Billing\Dto\MemberBalance;
use App\Enums\Group;
use App\Enums\LedgerType;
use App\Models\MessMember;

/**
 * Turns a MonthSnapshot into the three API payloads (Dashboard, Statement, History row).
 * Pure formatting: every money number comes from the engine or from stored rows. Integer paisa,
 * integer centi-meals, positive = credit, negative = due. Never writes.
 */
final class BalanceViews
{
    /** @return array<string,mixed> */
    public static function dashboard(MonthSnapshot $s, int $cashPoolPaisa, ?int $managerMemberId, ?int $onlyMemberId = null, ?array $cashSplit = null): array
    {
        $rows = [];
        foreach ($s->memberIds as $id) {
            if ($onlyMemberId !== null && $id !== $onlyMemberId) {
                continue;
            }
            $member = $s->members->get($id);
            $rows[] = self::row($s, $member, $s->balances->members[$id]);
        }

        $fixedBills = 0;
        foreach ($s->charge->bills as $split) {
            if ($split->group === Group::Fixed) {
                $fixedBills += array_sum($split->shares) + $split->unallocatedPaisa;
            }
        }
        $managerBalance = $managerMemberId !== null && isset($s->balances->members[$managerMemberId])
            ? $s->balances->members[$managerMemberId]->totalPaisa : 0;

        return [
            'month' => self::monthInfo($s),
            'today' => $s->today,
            'totals' => [
                'fixed_bills_paisa' => $fixedBills,
                'fixed_expenses_paisa' => $s->expensesByGroup['fixed'],
                'meals_expenses_paisa' => $s->expensesByGroup['meals'],
                'food_cost_paisa' => $s->foodCostPaisa,
                'total_meals_centi' => $s->charge->meal->totalEffectiveMealsCenti,
                'meal_rate_paisa' => $s->charge->meal->displayRatePaisa,
                'rounding_extra_paisa' => $s->roundingExtraPaisa,
                'uncharged_food_paisa' => $s->charge->unchargedFoodPaisa,
                'zero_meals_unresolved' => $s->charge->meal->zeroMealsUnresolved,
                'charged_paisa' => self::sumGroups($s->charged),
                'paid_paisa' => (int) $s->payments->sum('amount_paisa'),
            ],
            'cash_pool_paisa' => $cashPoolPaisa,
            'cash_pool_fixed_paisa' => $cashSplit['fixed'] ?? null,
            'cash_pool_meals_paisa' => $cashSplit['meals'] ?? null,
            'manager_member_id' => $managerMemberId,
            'manager_balance_paisa' => $onlyMemberId !== null ? null : $managerBalance,
            'members' => $rows,
        ];
    }

    /** @return array<string,mixed> */
    public static function statement(MonthSnapshot $s, MessMember $member): array
    {
        $id = $member->id;
        $b = $s->balances->members[$id];
        $lines = self::lines($s, $id);

        return [
            'member' => [
                'id' => $member->id,
                'display_name' => $member->display_name,
                'is_archived' => $member->archived_at !== null,
                'is_active' => in_array($id, $s->activeMemberIds, true),
            ],
            'month' => self::monthInfo($s),
            'today' => $s->today,
            'carry_in_paisa' => $b->fixed->carryInPaisa,
            'lines' => $lines,
            'fixed_balance_paisa' => self::splitBalances($b)[0],
            'meals_balance_paisa' => self::splitBalances($b)[1],
            'total_paisa' => $b->totalPaisa,
            'fixed_outstanding_paisa' => $b->fixedOutstandingPaisa,
            'deposit_required_paisa' => $b->depositRequiredPaisa,
            'deposit_outstanding_paisa' => $b->depositOutstandingPaisa,
            'fixed_overdue_days' => $b->fixedOverdueDays,
            'deposit_overdue_days' => $b->depositOverdueDays,
        ];
    }

    /** @return array<string,mixed> */
    public static function historyRow(MonthSnapshot $s): array
    {
        $due = 0;
        $credit = 0;
        foreach ($s->balances->members as $b) {
            $b->totalPaisa < 0 ? $due += -$b->totalPaisa : $credit += $b->totalPaisa;
        }

        return [
            'month_id' => $s->month->id,
            'starts_on' => $s->month->starts_on->toDateString(),
            'ends_on' => $s->month->ends_on->toDateString(),
            'status' => $s->month->status->value,
            'closed_at' => $s->month->closed_at?->toIso8601String(),
            'fixed_charged_paisa' => array_sum($s->charged['fixed']),
            'meals_charged_paisa' => array_sum($s->charged['meals']),
            'expenses_paisa' => $s->expensesByGroup['fixed'] + $s->expensesByGroup['meals'],
            'paid_paisa' => (int) $s->payments->sum('amount_paisa'),
            'total_meals_centi' => $s->charge->meal->totalEffectiveMealsCenti,
            'meal_rate_paisa' => $s->charge->meal->displayRatePaisa,
            'rounding_extra_paisa' => $s->roundingExtraPaisa,
            'total_due_paisa' => $due,
            'total_credit_paisa' => $credit,
        ];
    }

    /**
     * One month of a member's history: charged = that month's fixed + meals bill (no carry-in),
     * paid = the member's payments in the month, balance = the statement's total_paisa.
     * Null when the member was not part of the month.
     *
     * @return array<string,mixed>|null
     */
    public static function memberHistoryRow(MonthSnapshot $s, int $memberId): ?array
    {
        if (! in_array($memberId, $s->activeMemberIds, true) || ! isset($s->balances->members[$memberId])) {
            return null;
        }
        $b = $s->balances->members[$memberId];

        return [
            'month_id' => $s->month->id,
            'starts_on' => $s->month->starts_on->toDateString(),
            'ends_on' => $s->month->ends_on->toDateString(),
            'status' => $s->month->status->value,
            'charged_paisa' => $b->fixed->chargesPaisa + $b->meals->chargesPaisa,
            'paid_paisa' => $b->fixed->paymentsPaisa + $b->meals->paymentsPaisa,
            'balance_paisa' => $b->totalPaisa,
        ];
    }

    // ------------------------------------------------------------------ pieces

    /** @return array<string,mixed> */
    private static function monthInfo(MonthSnapshot $s): array
    {
        $m = $s->month;

        return [
            'id' => $m->id,
            'starts_on' => $m->starts_on->toDateString(),
            'ends_on' => $m->ends_on->toDateString(),
            'status' => $m->status->value,
            'fixed_deadline' => $m->fixed_deadline?->toDateString(),
            'deposit_deadline' => $m->deposit_deadline?->toDateString(),
        ];
    }

    /**
     * The fixed/meals split as shown to people. A fixed due is never reduced by a meals credit (it is
     * owed by the fixed deadline; meals settle at month close), but a fixed credit goes to the meals
     * side, so it can cover a meals due. The two still add up to the total.
     *
     * @return array{0:int,1:int} [fixed, meals]
     */
    private static function splitBalances(MemberBalance $b): array
    {
        $fixed = $b->fixed->balancePaisa;

        return [min(0, $fixed), $b->meals->balancePaisa + max(0, $fixed)];
    }

    /** @return array<string,mixed> */
    private static function row(MonthSnapshot $s, MessMember $member, MemberBalance $b): array
    {
        $id = $member->id;

        return [
            'member_id' => $id,
            'display_name' => $member->display_name,
            'is_archived' => $member->archived_at !== null,
            'is_active' => in_array($id, $s->activeMemberIds, true),
            'meals_centi' => $s->mealsCenti[$id] ?? 0,
            'effective_meals_centi' => $s->charge->meal->effectiveMealsCenti[$id] ?? 0,
            'carry_in_paisa' => $b->fixed->carryInPaisa,
            'fixed_bill_paisa' => $b->fixed->chargesPaisa,
            'meals_bill_paisa' => $b->meals->chargesPaisa,
            'paid_paisa' => $b->fixed->paymentsPaisa + $b->meals->paymentsPaisa,
            'own_pocket_paisa' => $b->fixed->ownPocketPaisa + $b->meals->ownPocketPaisa,
            'own_pocket_fixed_paisa' => $b->fixed->ownPocketPaisa,
            'own_pocket_meals_paisa' => $b->meals->ownPocketPaisa,
            'fixed_balance_paisa' => self::splitBalances($b)[0],
            'meals_balance_paisa' => self::splitBalances($b)[1],
            'balance_paisa' => $b->totalPaisa,
            'fixed_outstanding_paisa' => $b->fixedOutstandingPaisa,
            'deposit_required_paisa' => $b->depositRequiredPaisa,
            'deposit_outstanding_paisa' => $b->depositOutstandingPaisa,
            'fixed_overdue_days' => $b->fixedOverdueDays,
            'deposit_overdue_days' => $b->depositOverdueDays,
        ];
    }

    /**
     * StatementLine: {kind, group, label, date, amount_paisa}; amount signed, member's view.
     * Sum of all amounts == total_paisa. Zero-amount lines are left out.
     *
     * @return list<array<string,mixed>>
     */
    private static function lines(MonthSnapshot $s, int $id): array
    {
        $b = $s->balances->members[$id];
        $out = [];
        $add = function (string $kind, ?string $group, string $label, int $amount, ?string $date = null) use (&$out) {
            if ($amount !== 0) {
                $out[] = ['kind' => $kind, 'group' => $group, 'label' => $label, 'date' => $date, 'amount_paisa' => $amount];
            }
        };

        $add('carry_in', 'fixed', 'Last month due', $b->fixed->carryInPaisa);

        if (! $s->stored) {
            foreach ($s->charge->bills as $categoryId => $split) {
                $name = $s->categories->get($categoryId)?->name ?? 'Bill';
                $add('fixed_bill', $split->group->value, $name, -($split->shares[$id] ?? 0));
            }
            $add('meal_charge', 'meals', 'Meal charge', -($s->charge->meal->charges[$id] ?? 0));
            foreach (['fixed', 'meals'] as $group) {
                $delta = ($s->charge->charged[$group][$id] ?? 0) - ($s->charge->exact[$group][$id] ?? 0);
                $add('rounding', $group, 'Rounding', -$delta);
            }
        }
        // A closed month's charge and rounding rows come from the stored ledger rows, below.

        foreach ($s->payments->where('member_id', $id) as $p) {
            $add('payment', $p->group->value, 'Payment', $p->amount_paisa, $p->paid_on->toDateString());
        }
        foreach ($s->ownPocket->where('paid_by_member_id', $id) as $e) {
            $group = ($s->categories->get($e->category_id)?->group ?? Group::Fixed)->value;
            $label = 'Paid from pocket'.($e->note ? ': '.$e->note : '');
            $add('own_pocket_expense', $group, $label, $e->amount_paisa, $e->spent_on->toDateString());
        }
        foreach ($s->ledger->where('member_id', $id) as $e) {
            $group = $e->group?->value ?? 'fixed';
            $add($e->type->value, $group, $e->note ?: self::ledgerLabel($e->type), $e->amount_paisa, $e->created_at?->toDateString());
        }
        if (! $s->stored) {
            foreach ($s->balances->doesntPay as $split) {
                if ($split->debtorMemberId === $id) {
                    $add('doesnt_pay_out', 'fixed', 'Unpaid share passed to others', $split->amountPaisa);
                } elseif (($split->shares[$id] ?? 0) !== 0) {
                    $debtor = $s->members->get($split->debtorMemberId)?->display_name ?? 'a member';
                    $add('doesnt_pay_in', 'fixed', "Share of {$debtor}'s unpaid bill", -$split->shares[$id]);
                }
            }
        }

        return $out;
    }

    private static function ledgerLabel(LedgerType $type): string
    {
        return match ($type) {
            LedgerType::Adjustment => 'Adjustment',
            LedgerType::DoesntPayOut => 'Unpaid share passed to others',
            LedgerType::DoesntPayIn => "Share of another member's unpaid bill",
            LedgerType::RecoverableRepay => 'Repayment received',
            LedgerType::FinalPayout => 'Final payout',
            LedgerType::Opening => 'Opening balance',
            LedgerType::Charge => 'Charge',
            LedgerType::Rounding => 'Rounding',
        };
    }

    /** @param array<string,array<int,int>> $groups */
    private static function sumGroups(array $groups): int
    {
        return array_sum($groups['fixed']) + array_sum($groups['meals']);
    }
}
