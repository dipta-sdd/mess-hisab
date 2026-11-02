<?php

namespace App\Http\Controllers\Balance;

use App\Http\Resources\Balance\HistoryRowResource;
use App\Models\Mess;
use App\Services\Balance\BalanceViews;
use App\Services\Balance\MonthBalanceService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class HistoryController extends BalanceController
{
    public function index(Mess $mess, MonthBalanceService $balances): AnonymousResourceCollection
    {
        $rows = array_map(fn ($snapshot) => BalanceViews::historyRow($snapshot), $balances->allSnapshots($mess));

        return HistoryRowResource::collection($rows);
    }
}
