<?php

namespace App\Http\Controllers\Audit;

use App\Http\Controllers\Controller;
use App\Http\Requests\Audit\AuditIndexRequest;
use App\Http\Resources\Audit\AuditLogResource;
use App\Models\AuditLog;
use App\Models\Mess;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;

class AuditController extends Controller
{
    /**
     * Any member (archived too: read-only) sees this mess's audit trail, newest first.
     * `event`: exact name, or a prefix when it ends with "." (e.g. "expense.").
     * `from`/`to`: Y-m-d, inclusive, interpreted in Asia/Dhaka.
     * Response is Laravel's paginator envelope: {data, links, meta}.
     */
    public function index(AuditIndexRequest $request, Mess $mess): AnonymousResourceCollection
    {
        $f = $request->validated();
        $tz = 'Asia/Dhaka';
        // created_at is stored in the app timezone; convert the Dhaka day bounds to it.
        $fromAt = isset($f['from']) ? Carbon::parse($f['from'], $tz)->startOfDay()->setTimezone(config('app.timezone')) : null;
        $toAt = isset($f['to']) ? Carbon::parse($f['to'], $tz)->endOfDay()->setTimezone(config('app.timezone')) : null;

        $logs = AuditLog::query()
            ->forMess($mess->id) // explicit, in addition to the global scope
            ->when(isset($f['event']), function ($q) use ($f) {
                if (str_ends_with($f['event'], '.')) {
                    return $q->where('event', 'like', addcslashes($f['event'], '\\%_').'%');
                }

                return $q->where('event', $f['event']);
            })
            ->when(isset($f['member_id']), fn ($q) => $q->where('member_id', $f['member_id']))
            ->when($fromAt, fn ($q) => $q->where('created_at', '>=', $fromAt))
            ->when($toAt, fn ($q) => $q->where('created_at', '<=', $toAt))
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($f['per_page'] ?? 25);

        return AuditLogResource::collection($logs);
    }
}
