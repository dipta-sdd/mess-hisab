<?php

namespace App\Http\Controllers\Lifecycle;

use App\Http\Controllers\Controller;
use App\Http\Requests\Lifecycle\CloseMonthRequest;
use App\Http\Resources\Lifecycle\ArrayResource;
use App\Http\Resources\MonthResource;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Month\Lifecycle\CloseChecker;
use App\Services\Month\Lifecycle\MonthCloser;
use App\Services\Month\Lifecycle\MonthReopener;
use App\Services\Sms\MemberNotifier;
use Illuminate\Http\Request;

/** Task K: close / reopen a month. Manager only (routes/api/months.php). */
class MonthLifecycleController extends Controller
{
    public function closeCheck(CloseMonthRequest $request, Mess $mess, Month $month, CloseChecker $checker): ArrayResource
    {
        return new ArrayResource($checker->check($mess, $month, $request->resolution()));
    }

    public function close(CloseMonthRequest $request, Mess $mess, Month $month, MonthCloser $closer, MemberNotifier $notifier): MonthResource
    {
        $closed = $closer->close($mess, $month, $request->resolution(), currentMember());
        $notifier->monthClosed($month->refresh());

        return new MonthResource($closed);
    }

    public function reopenPreview(Request $request, Mess $mess, Month $month, MonthReopener $reopener): ArrayResource
    {
        return new ArrayResource($reopener->preview($mess, $month));
    }

    public function reopen(Request $request, Mess $mess, Month $month, MonthReopener $reopener): MonthResource
    {
        return new MonthResource($reopener->reopen($mess, $month, currentMember()));
    }
}
