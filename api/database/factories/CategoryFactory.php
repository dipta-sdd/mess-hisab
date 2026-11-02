<?php

namespace Database\Factories;

use App\Enums\Group;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\Mess;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'mess_id' => Mess::factory(),
            'group' => Group::Fixed,
            'name' => fake()->word(),
            'split_type' => SplitType::Equal,
        ];
    }

    public function meals(SplitType $split = SplitType::ByMeal): static
    {
        return $this->state(['group' => Group::Meals, 'split_type' => $split]);
    }
}
