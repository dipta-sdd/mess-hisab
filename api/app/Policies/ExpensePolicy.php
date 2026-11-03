<?php

namespace App\Policies;

use App\Models\Expense;
use App\Models\MessMember;

/**
 * Who may touch an expense, by identity only. Laravel's Gate passes a User, but mess roles live on
 * MessMember, so this class is called directly (ExpenseService), not through Gate. Status and
 * month rules (the 409s) are in ExpenseService.
 */
class ExpensePolicy
{
    public function modify(MessMember $member, Expense $expense): bool
    {
        return $member->isStaff() || $expense->created_by_member_id === $member->id;
    }
}
