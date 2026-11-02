<?php

namespace Database\Seeders;

use App\Enums\Group;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Local demo data only (password "password"). Members S < D < N by id, like the Excel October sheet.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $users = collect(['Shuvendu', 'Dipta', 'Nilu'])->map(fn (string $name) => User::factory()->create([
            'name' => $name,
            'email' => strtolower($name).'@example.com',
            'password' => Hash::make('password'),
        ]));

        $mess = Mess::create(['name' => 'Demo Mess', 'created_by_user_id' => $users[0]->id]);

        $members = $users->map(fn (User $u) => MessMember::forMess($mess->id)->create([
            'mess_id' => $mess->id,
            'user_id' => $u->id,
            'display_name' => $u->name,
            'joined_on' => '2026-11-01',
        ]));

        $mess->update(['admin_member_id' => $members[0]->id, 'manager_member_id' => $members[1]->id]);

        Month::forMess($mess->id)->create([
            'mess_id' => $mess->id,
            'starts_on' => '2026-11-01',
            'ends_on' => '2026-11-30',
            'fixed_deadline' => '2026-11-05',
            'deposit_deadline' => '2026-11-05',
        ]);

        $defaults = [
            [Group::Fixed, 'Rent', SplitType::FixedPerPerson],
            [Group::Fixed, 'Wifi', SplitType::Equal],
            [Group::Fixed, 'Electricity', SplitType::Equal],
            [Group::Fixed, 'Cook', SplitType::Equal],
            [Group::Meals, 'Bazar', SplitType::ByMeal],
        ];
        foreach ($defaults as $i => [$group, $name, $split]) {
            Category::forMess($mess->id)->create([
                'mess_id' => $mess->id, 'group' => $group, 'name' => $name,
                'split_type' => $split, 'sort' => $i, 'is_default' => true,
            ]);
        }
    }
}
