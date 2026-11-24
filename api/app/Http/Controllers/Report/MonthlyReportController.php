<?php

namespace App\Http\Controllers\Report;

use App\Http\Controllers\Controller;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Report\MonthlyReport;
use App\Http\Requests\Report\PreviewReportRequest;
use App\Services\Report\MonthlyReportPdf;
use App\Services\Report\MonthlyReportPreview;
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

    /** Manager only: what the preview popup's next-month section starts from. Saves nothing. */
    public function previewNextBills(Mess $mess, int $month, MonthlyReportPreview $preview): JsonResponse
    {
        $month = Month::query()->forMess($mess->id)->findOrFail($month);

        try {
            return response()->json(['data' => $preview->nextBills($mess, $month)]);
        } catch (ReportException $e) {
            return $this->refused($e);
        }
    }

    /** Manager only: the report of a month that is not closed. Saves nothing. */
    public function preview(PreviewReportRequest $request, Mess $mess, int $month, MonthlyReportPreview $preview): JsonResponse
    {
        $month = Month::query()->forMess($mess->id)->findOrFail($month);

        try {
            return response()->json(['data' => $preview->build($mess, $month, $request->resolution(), $request->billEdits(), $request->nextBills(), $request->surplus(), currentMember())]);
        } catch (ReportException $e) {
            return $this->refused($e);
        }
    }

    /** The preview as a PDF, marked PREVIEW. */
    public function previewPdf(PreviewReportRequest $request, Mess $mess, int $month, MonthlyReportPreview $preview, MonthlyReportPdf $pdf): Response|JsonResponse
    {
        $month = Month::query()->forMess($mess->id)->findOrFail($month);

        try {
            $data = $preview->build($mess, $month, $request->resolution(), $request->billEdits(), $request->nextBills(), $request->surplus(), currentMember());
        } catch (ReportException $e) {
            return $this->refused($e);
        }
        [$bytes, $file] = $pdf->renderData($mess, $data);

        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$file.'"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    private function refused(ReportException $e): JsonResponse
    {
        return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode] + $e->extra, 409);
    }
}
