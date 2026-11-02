<?php

namespace App\Http\Controllers\Balance;

use App\Http\Resources\Balance\MemberHistoryRowResource;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Staff may read any member's history; a normal member only their own. */
class MemberHistoryController extends BalanceController
{
    public function index(Mess $mess, MessMember $member, MonthBalanceService $balances): AnonymousResourceCollection
    {
        abort_unless(currentMember()->isStaff() || currentMember()->id === $member->id, 403, __('Your role cannot do this.'));

        $rows = [];
        foreach ($balances->allSnapshots($mess) as $snapshot) { // newest first
            $row = BalanceViews::memberHistoryRow($snapshot, $member->id);
            if ($row !== null) {
                $rows[] = $row;
            }
        }

        return MemberHistoryRowResource::collection($rows);
    }
}
