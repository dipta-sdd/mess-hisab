<?php

namespace App\Http\Controllers\Report;

use App\Http\Controllers\Controller;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Report\MonthlyReport;
use App\Services\Report\MonthlyReportPdf;
use App\Services\Report\ReportException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

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

    /** The same report as a one-page English PDF download. */
    public function pdf(Mess $mess, int $month, MonthlyReportPdf $pdf): Response|JsonResponse
    {
        $month = Month::query()->forMess($mess->id)->findOrFail($month);

        try {
            [$bytes, $file] = $pdf->render($mess, $month);
        } catch (ReportException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode] + $e->extra, 409);
        }

        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$file.'"',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
