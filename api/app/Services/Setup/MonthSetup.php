<?php

namespace App\Services\Setup;

use App\Models\MemberMonthSetting;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Validation\ValidationException;

/** Task H: month-level setup (deadlines, default deposit) and per-member deposit / min-meals overrides. */
class MonthSetup
{
    public function __construct(private BillSetup $bills) {}

    /**
     * @param  array{fixed_deadline?: ?string, deposit_deadline?: ?string, deposit_paisa?: int}  $data  only present keys change
     */
    public function updateMonth(Month $month, array $data): Month
    {
        return $this->bills->locked($month, function (Month $month) use ($data) {
            $month->fill(array_intersect_key($data, array_flip(['fixed_deadline', 'deposit_deadline', 'deposit_paisa'])));
            $month->save();

            return $month->fresh();
        });
    }

    /**
     * Upsert the member's overrides. Only keys present in $data change; null clears that override.
     *
     * @param  array{deposit_paisa?: ?int, min_meals_centi?: ?int}  $data
     */
    public function updateMemberSettings(Month $month, MessMember $member, array $data): MemberMonthSetting
    {
        return $this->bills->locked($month, function (Month $month) use ($member, $data) {
            if (! $member->isActiveIn($month)) {
                throw ValidationException::withMessages(['member' => ['This member was not active in this month.']]);
            }

            $setting = MemberMonthSetting::query()->firstOrNew(
                ['month_id' => $month->id, 'member_id' => $member->id],
                ['mess_id' => $month->mess_id],
            );
            $setting->fill(array_intersect_key($data, array_flip(['deposit_paisa', 'min_meals_centi'])));
            $setting->save();

            return $setting->fresh();
        });
    }
}
