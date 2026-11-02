<?php

namespace App\Http\Controllers\Balance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Balance\MonthQueryRequest;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Month\Calendar;

/** Shared month lookup for the read-only balance endpoints. Never creates a month. */
abstract class BalanceController extends Controller
{
    /**
     * `month_id` (404 if it is not this mess's), else the month that contains today,
     * else the newest open month, else the newest month.
     */
    protected function month(MonthQueryRequest $request, Mess $mess, Calendar $calendar): Month
    {
        if ($request->has('month_id')) {
            return Month::query()->forMess($mess->id)->findOrFail($request->integer('month_id'));
        }

        $today = $calendar->today()->toDateString();

        return Month::query()->forMess($mess->id)->where('starts_on', '<=', $today)->where('ends_on', '>=', $today)->first()
            ?? Month::query()->forMess($mess->id)->where('status', 'open')->orderByDesc('starts_on')->first()
            ?? Month::query()->forMess($mess->id)->orderByDesc('starts_on')->firstOrFail();
    }
}
