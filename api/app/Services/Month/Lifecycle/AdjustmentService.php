<?php

namespace App\Services\Month\Lifecycle;

use App\Enums\Group;
use App\Enums\LedgerType;
use App\Models\LedgerEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Month\Calendar;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Task K: a manager's manual correction to one member's balance. Signed (+ credit, - due), always put
 * in the current open month. It is a plain `adjustment` ledger row, so the close-check counts it.
 */
class AdjustmentService
{
    public function __construct(private readonly Calendar $calendar) {}

    public function create(Mess $mess, int $memberId, Group $group, int $amountPaisa, string $note, MessMember $by): LedgerEntry
    {
        return DB::transaction(function () use ($mess, $memberId, $group, $amountPaisa, $note, $by) {
            Mess::query()->whereKey($mess->id)->lockForUpdate()->firstOrFail(); // a close holds this lock too
            $month = $this->calendar->currentMonth($mess);

            return LedgerEntry::create([
                'mess_id' => $mess->id, 'month_id' => $month->id, 'member_id' => $memberId,
                'group' => $group->value, 'type' => LedgerType::Adjustment, 'amount_paisa' => $amountPaisa,
                'note' => $note, 'created_by_member_id' => $by->id, 'created_at' => Carbon::now(),
            ]);
        });
    }
}
