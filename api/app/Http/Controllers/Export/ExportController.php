<?php

namespace App\Http\Controllers\Export;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Export\StoreExportRequest;
use App\Http\Resources\ExportResource;
use App\Jobs\Export\GenerateExport;
use App\Models\Export;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Support\MessContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Excel exports. Any member of the mess may request, read and download any of its exports: the books are
 * open to every member (PROJECT §2), and the file only holds what the dashboard/statement already show.
 * Export ids resolve through the mess scope, so another mess's export is a 404.
 */
class ExportController extends Controller
{
    public function store(StoreExportRequest $request, Mess $mess, MessContext $context): JsonResponse
    {
        $type = ExportType::from($request->validated('type'));
        $month = Month::query()->forMess($mess->id)->findOrFail($request->integer('month_id'));
        $params = ['month_id' => $month->id];

        if ($type === ExportType::Statement) {
            $member = MessMember::query()->forMess($mess->id)->findOrFail($request->integer('member_id'));
            $params['member_id'] = $member->id;
        }

        $export = Export::query()->create([
            'mess_id' => $mess->id,
            'requested_by_member_id' => $context->member()->id,
            'type' => $type,
            'params' => $params,
            'status' => ExportStatus::Queued,
        ]);

        GenerateExport::dispatch($mess->id, $export->id);

        return (new ExportResource($export->refresh()))->response()->setStatusCode(202);
    }

    public function show(Mess $mess, Export $export): ExportResource
    {
        return new ExportResource($export);
    }

    public function download(Mess $mess, Export $export): StreamedResponse|JsonResponse
    {
        $disk = Storage::disk('local');
        if ($export->status !== ExportStatus::Done || ! $export->path || ! $disk->exists($export->path)) {
            return response()->json(['message' => 'The export is not ready.', 'code' => 'export_not_ready'], 409);
        }

        $name = "mess-{$mess->id}-{$export->type->value}-{$export->id}.xlsx";

        return $disk->download($export->path, $name, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
