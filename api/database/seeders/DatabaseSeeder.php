<?php

namespace Database\Seeders;

use App\Enums\Group;
use App\Enums\MealTracking;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\MessMember;
use App\Models\User;
use App\Services\Expense\ExpenseService;
use App\Services\Mess\MessCreator;
use App\Services\Month\Calendar;
use App\Services\Month\Lifecycle\MonthCloser;
use App\Services\Setup\BillSetup;
use App\Support\MessContext;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Local demo data from the owner's real sheet, `Meser hisab (Responses).xlsx` (dev only).
 *
 * Logins (all three use the password "password"):
 *   dipta@mess.test     Dipta, admin and manager (created the mess)
 *   shuvendu@mess.test  Shuvendu, member
 *   nilu@mess.test      Nilu, member
 *
 * October 2026 (sheet `Sheet1`): the 26 bazar entries, each paid from the member's own pocket,
 * shared equally (the sheet has no meal counts, so meal tracking is off). October is closed, so
 * each person's leftover due/credit carries into November's Fixed bill as "Last month due".
 * November 2026 (sheet `Form Responses 1`): rent per person 2000 / 3500 / 2000, and Didi 1500,
 * Wifi 1000, Electricity 1565 shared equally. No bazar or payments yet, like the sheet.
 */
class DatabaseSeeder extends Seeder
{
    private const PASSWORD = 'password';

    /** Sheet1 rows: [Excel date serial, name, taka]. */
    private const OCTOBER_BAZAR = [
        [46304, 'Shuvendu', 200], [46304, 'Shuvendu', 410], [46304, 'Shuvendu', 100],
        [46304, 'Dipta', 50], [46304, 'Dipta', 1000], [46304, 'Dipta', 680],
        [46307, 'Dipta', 1791], [46307, 'Dipta', 360], [46307, 'Dipta', 1025], [46307, 'Dipta', 240],
        [46307, 'Shuvendu', 915],
        [46314, 'Shuvendu', 255], [46314, 'Shuvendu', 150], [46314, 'Shuvendu', 1090],
        [46315, 'Dipta', 2150], [46317, 'Dipta', 500],
        [46318, 'Nilu', 400], [46318, 'Dipta', 100], [46318, 'Shuvendu', 50],
        [46320, 'Nilu', 360], [46321, 'Nilu', 1468], [46322, 'Nilu', 238], [46325, 'Nilu', 294],
        [46325, 'Dipta', 156], [46325, 'Dipta', 320],
        [46326, 'Shuvendu', 280],
    ];

    private const RENT = ['Shuvendu' => 2000, 'Dipta' => 3500, 'Nilu' => 2000];

    private const OTHERS = ['Didi (cook)' => 1500, 'Wifi' => 1000, 'Electricity' => 1565];

    public function run(): void
    {
        $users = collect(['Dipta', 'Shuvendu', 'Nilu'])->mapWithKeys(fn (string $name) => [$name => User::factory()->create([
            'name' => $name,
            'email' => strtolower($name).'@mess.test',
            'password' => Hash::make(self::PASSWORD),
        ])]);

        [$mess, $dipta] = app(MessCreator::class)->create($users['Dipta'], [
            'name' => 'Meser Hisab',
            'first_month_starts_on' => '2026-10-01',
            'creator_display_name' => 'Dipta',
            'members' => [['display_name' => 'Shuvendu'], ['display_name' => 'Nilu']],
        ]);
        $mess->forceFill(['meal_tracking' => MealTracking::Off])->saveQuietly();

        app(MessContext::class)->set($mess, $dipta);

        // The placeholders get their accounts (what accepting an invite does).
        $members = MessMember::query()->get()->keyBy('display_name');
        foreach (['Shuvendu', 'Nilu'] as $name) {
            $members[$name]->forceFill(['user_id' => $users[$name]->id])->save();
        }

        Category::query()->where('name', 'Bazar')->update(['split_type' => SplitType::Equal]);
        Category::query()->where('name', 'Cook')->update(['name' => 'Didi (cook)']);
        $categories = Category::query()->get()->keyBy('name');

        $expenses = app(ExpenseService::class);
        foreach (self::OCTOBER_BAZAR as [$serial, $name, $taka]) {
            $expenses->create($mess, $dipta, [
                'category_id' => $categories['Bazar']->id,
                'amount_paisa' => $taka * 100,
                'spent_on' => now()->setDate(1899, 12, 30)->addDays($serial)->toDateString(),
                'paid_by' => 'member',
                'paid_by_member_id' => $members[$name]->id,
            ]);
        }

        $calendar = app(Calendar::class);
        $october = $calendar->monthFor($mess, '2026-10-01');
        app(MonthCloser::class)->close($mess->fresh(), $october, null, $dipta);

        $november = $calendar->monthFor($mess, '2026-11-01');
        $bills = app(BillSetup::class);
        $rent = collect(self::RENT)->mapWithKeys(fn (int $taka, string $name) => [$members[$name]->id => $taka * 100])->all();
        $bills->save($november, $categories['Rent'], array_sum($rent), $rent);
        foreach (self::OTHERS as $name => $taka) {
            $bills->save($november, $categories[$name], $taka * 100, null);
        }

        app(MessContext::class)->clear();
    }
}
