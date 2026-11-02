<?php

namespace App\Http\Controllers\Report;

use App\Http\Controllers\Controller;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Report\MonthlyReport;
use App\Services\Report\ReportException;
use Illuminate\Http\JsonResponse;

class MonthlyReportController extends Controller
{
    public function show(Mess $mess, int $month, MonthlyReport $report): JsonResponse
    {
        $month = Month::query()->forMess($mess->id)->findOrFail($month);

        try {
            return response()->json(['data' => $report->build($mess, $month)]);
        } catch (ReportException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode] + $e->extra, 409);
        }
    }
}
