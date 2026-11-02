<?php

namespace App\Http\Controllers\Balance;

use App\Http\Resources\Balance\MemberHistoryRowResource;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Any member may read any member's history, like the statement: the books are open (PROJECT §2). */
class MemberHistoryController extends BalanceController
{
    public function index(Mess $mess, MessMember $member, MonthBalanceService $balances): AnonymousResourceCollection
    {
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
