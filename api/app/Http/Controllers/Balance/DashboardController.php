<?php

namespace App\Http\Controllers\Balance;

use App\Http\Requests\Balance\MonthQueryRequest;
use App\Http\Resources\Balance\DashboardResource;
use App\Models\Mess;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use App\Services\CashPool\CashPool;
use App\Services\Month\Calendar;

class DashboardController extends BalanceController
{
    public function show(MonthQueryRequest $request, Mess $mess, MonthBalanceService $balances, Calendar $calendar): DashboardResource
    {
        $snapshot = $balances->snapshot($this->month($request, $mess, $calendar));

        return new DashboardResource(BalanceViews::dashboard($snapshot, CashPool::balance($mess), $mess->manager_member_id, currentMember()->isStaff() && $request->input('scope') !== 'own' ? null : currentMember()->id, CashPool::breakdown($mess)));
    }
}
