<?php

namespace App\Jobs\Export;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Exports\MonthExportBuilder;
use App\Exports\StatementExportBuilder;
use App\Models\Export;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Maatwebsite\Excel\Facades\Excel;
use Throwable;

/**
 * Builds the xlsx for one Export. Runs in a worker: there is no request and no MessContext, so the mess id
 * is passed in and every query is scoped with forMess(). A failure is recorded on the row (status failed).
 */
class GenerateExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $messId, public readonly int $exportId) {}

    public function handle(MonthExportBuilder $monthBuilder, StatementExportBuilder $statementBuilder): void
    {
        $export = Export::query()->forMess($this->messId)->find($this->exportId);
        if ($export === null) {
            return;
        }

        try {
            $export->update(['status' => ExportStatus::Running, 'error' => null]);

            $mess = Mess::query()->findOrFail($this->messId);
            $params = $export->params ?? [];
            $month = Month::query()->forMess($this->messId)->findOrFail($params['month_id'] ?? 0);

            if ($export->type === ExportType::Statement) {
                $member = MessMember::query()->forMess($this->messId)->findOrFail($params['member_id'] ?? 0);
                $workbook = $statementBuilder->build($mess, $month, $member);
            } else {
                $workbook = $monthBuilder->build($mess, $month);
            }

            $path = "exports/{$this->messId}/{$export->id}-{$export->type->value}.xlsx";
            Excel::store($workbook, $path, 'local');

            $export->update(['status' => ExportStatus::Done, 'path' => $path]);
        } catch (Throwable $e) {
            report($e);
            $this->markFailed($export);
        }
    }

    /** Also called by the queue when the job dies outside handle() (timeout, killed worker). */
    public function failed(?Throwable $e): void
    {
        $export = Export::query()->forMess($this->messId)->find($this->exportId);
        if ($export !== null) {
            $this->markFailed($export);
        }
    }

    private function markFailed(Export $export): void
    {
        $export->update(['status' => ExportStatus::Failed, 'error' => 'The export could not be generated.']);
    }
}
