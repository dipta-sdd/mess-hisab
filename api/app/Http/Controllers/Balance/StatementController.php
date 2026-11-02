<?php

namespace App\Http\Controllers\Balance;

use App\Http\Requests\Balance\MonthQueryRequest;
use App\Http\Resources\Balance\StatementResource;
use App\Models\Mess;
use App\Models\MessMember;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use App\Services\Month\Calendar;

/** Staff may read any member's statement; a normal member only their own. */
class StatementController extends BalanceController
{
    public function show(MonthQueryRequest $request, Mess $mess, MessMember $member, MonthBalanceService $balances, Calendar $calendar): StatementResource
    {
        abort_unless(currentMember()->isStaff() || currentMember()->id === $member->id, 403, __('Your role cannot do this.'));

        $snapshot = $balances->snapshot($this->month($request, $mess, $calendar));

        return new StatementResource(BalanceViews::statement($snapshot, $member));
    }
}
