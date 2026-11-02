<?php

namespace App\Http\Controllers\Balance;

use App\Http\Requests\Balance\MonthQueryRequest;
use App\Http\Resources\Balance\StatementResource;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use App\Services\Month\Calendar;

/** Any member may read any member's statement: the books are open (PROJECT §2). */
class StatementController extends BalanceController
{
    public function show(MonthQueryRequest $request, Mess $mess, MessMember $member, MonthBalanceService $balances, Calendar $calendar): StatementResource
    {
        $snapshot = $balances->snapshot($this->month($request, $mess, $calendar));

        return new StatementResource(BalanceViews::statement($snapshot, $member));
    }
}
