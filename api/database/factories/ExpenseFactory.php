<?php

namespace Database\Factories;

use App\Enums\ExpenseStatus;
use App\Enums\Group;
use App\Enums\PaidBy;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\Expense;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Expense>
 */
class ExpenseFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'month_id' => fn (array $a) => Month::factory()->state(['mess_id' => $a['mess_id']]),
            'category_id' => fn (array $a) => Category::factory()->state(['mess_id' => $a['mess_id'], 'group' => Group::Meals, 'split_type' => SplitType::ByMeal]),
            'paid_by_member_id' => fn (array $a) => $a['created_by_member_id'],
            'amount_paisa' => 50000,
            'spent_on' => '2026-11-05',
            'paid_by' => PaidBy::Member,
            'status' => ExpenseStatus::Approved,
            'created_by_member_id' => fn (array $a) => MessMember::factory()->state(['mess_id' => $a['mess_id']]),
        ];
    }
}
