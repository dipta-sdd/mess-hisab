<?php

namespace App\Services\Mess;

use App\Enums\Group;
use App\Enums\LedgerType;
use App\Enums\MonthStatus;
use App\Enums\SplitType;
use App\Models\Category;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Creates a mess with everything it needs on day one, in one transaction:
 * creator (admin + manager), first month, default categories, placeholder
 * members and `opening` ledger rows. Runs outside any MessContext, so every
 * row gets its mess_id explicitly.
 */
class MessCreator
{
    /** @var list<array{0: Group, 1: string, 2: SplitType}> */
    private const DEFAULT_CATEGORIES = [
        [Group::Fixed, 'Rent', SplitType::FixedPerPerson],
        [Group::Fixed, 'Wifi', SplitType::Equal],
        [Group::Fixed, 'Electricity', SplitType::Equal],
        [Group::Fixed, 'Cook', SplitType::Equal],
        [Group::Meals, 'Bazar', SplitType::ByMeal],
    ];

    /**
     * @param  array{name: string, month_start_day?: int, first_month_starts_on: string, creator_display_name: string, creator_opening_balance_paisa?: int|null, members?: array<int, array{display_name: string, opening_balance_paisa?: int|null}>}  $data
     * @return array{0: Mess, 1: MessMember}
     */
    public function create(User $user, array $data): array
    {
        return DB::transaction(function () use ($user, $data) {
            $startDay = (int) ($data['month_start_day'] ?? 1);
            $startsOn = Carbon::parse($data['first_month_starts_on'])->startOfDay();

            $mess = Mess::create([
                'name' => $data['name'],
                'month_start_day' => $startDay,
                'created_by_user_id' => $user->id,
            ])->fresh(); // pick up column defaults (offsets, rounding mode, ...)

            $creator = $this->member($mess, $data['creator_display_name'], $startsOn, $user->id);
            $mess->forceFill(['admin_member_id' => $creator->id, 'manager_member_id' => $creator->id])->saveQuietly();

            $month = $this->firstMonth($mess, $startsOn);
            $this->categories($mess);

            $this->opening($mess, $month, $creator, $data['creator_opening_balance_paisa'] ?? null, $creator);
            foreach ($data['members'] ?? [] as $row) {
                $placeholder = $this->member($mess, $row['display_name'], $startsOn, null);
                $this->opening($mess, $month, $placeholder, $row['opening_balance_paisa'] ?? null, $creator);
            }

            $mess = $mess->fresh();
            $creator->setRelation('mess', $mess);

            return [$mess, $creator];
        });
    }

    private function member(Mess $mess, string $name, Carbon $joinedOn, ?int $userId): MessMember
    {
        return MessMember::create([
            'mess_id' => $mess->id,
            'user_id' => $userId,
            'display_name' => $name,
            'joined_on' => $joinedOn->toDateString(),
        ]);
    }

    private function firstMonth(Mess $mess, Carbon $startsOn): Month
    {
        $endsOn = MonthBoundary::endFor($startsOn, (int) $mess->month_start_day);

        return Month::create([
            'mess_id' => $mess->id,
            'starts_on' => $startsOn->toDateString(),
            'ends_on' => $endsOn->toDateString(),
            'status' => MonthStatus::Open,
            'fixed_deadline' => $startsOn->copy()->addDays((int) $mess->fixed_due_day_offset - 1)->toDateString(),
            'deposit_deadline' => $startsOn->copy()->addDays((int) $mess->deposit_due_day_offset - 1)->toDateString(),
            'deposit_paisa' => (int) $mess->deposit_paisa,
        ]);
    }

    private function categories(Mess $mess): void
    {
        foreach (self::DEFAULT_CATEGORIES as $i => [$group, $name, $split]) {
            Category::create([
                'mess_id' => $mess->id,
                'group' => $group,
                'name' => $name,
                'split_type' => $split,
                'sort' => $i,
                'is_default' => true,
            ]);
        }
    }

    /** Typed opening balance, stored as-is (+ = credit, − = due), fixed group. Zero/null writes nothing. */
    public function opening(Mess $mess, Month $month, MessMember $member, ?int $amountPaisa, MessMember $createdBy): void
    {
        if (! $amountPaisa) {
            return;
        }

        LedgerEntry::create([
            'mess_id' => $mess->id,
            'month_id' => $month->id,
            'member_id' => $member->id,
            'group' => Group::Fixed,
            'type' => LedgerType::Opening,
            'amount_paisa' => $amountPaisa,
            'note' => 'Opening balance',
            'created_by_member_id' => $createdBy->id,
        ]);
    }
}
