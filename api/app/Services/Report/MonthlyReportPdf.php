<?php

namespace App\Services\Report;

use App\Models\Mess;
use App\Models\Month;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Mpdf\Mpdf;

/** The monthly report as a one-page A4 PDF (English only), built from the same data as the report page. */
class MonthlyReportPdf
{
    public function __construct(private MonthlyReport $report) {}

    /** @return array{0: string, 1: string} [pdf bytes, file name] */
    public function render(Mess $mess, Month $month): array
    {
        return $this->renderData($mess, $this->report->build($mess, $month));
    }

    /**
     * The same PDF for report data that is already built; a preview (`preview` key) gets a banner and a PREVIEW watermark.
     *
     * @param  array<string,mixed>  $data
     * @return array{0: string, 1: string} [pdf bytes, file name]
     */
    public function renderData(Mess $mess, array $data): array
    {
        $preview = isset($data['preview']);

        $html = view('reports.monthly-pdf', [
            'r' => $data,
            // A no-break space so "Tk 1,344.01" never splits across lines in a narrow column.
            'tk' => fn (int $paisa) => str_replace(' ', "\u{00A0}", Money::tk($paisa)),
            'monthName' => fn (string $date) => CarbonImmutable::parse($date)->format('F Y'),
            'day' => fn (?string $date) => $date ? CarbonImmutable::parse($date)->format('j M Y') : null,
            'categories' => $this->spendingByCategory($data['expenses']),
            'nextColumns' => $this->nextColumns($data['next_month']['rows'] ?? []),
            'warnings' => $preview ? $this->warnings($data['preview']['blocks']) : [],
        ])->render();

        $pdf = new Mpdf([
            'mode' => 'utf-8', 'format' => 'A4', 'tempDir' => storage_path('framework/cache/mpdf'),
            'margin_left' => 12, 'margin_right' => 12, 'margin_top' => 12, 'margin_bottom' => 12,
            'shrink_tables_to_fit' => 1,
        ]);
        $pdf->SetTitle($mess->name.' - '.CarbonImmutable::parse($data['month']['starts_on'])->format('F Y').($preview ? ' report (preview)' : ' report'));
        if ($preview) {
            $pdf->SetWatermarkText('PREVIEW', 0.1);
            $pdf->showWatermarkText = true;
        }
        $pdf->WriteHTML($html);

        $file = Str::slug($mess->name).'-'.substr($data['month']['starts_on'], 0, 7).($preview ? '-preview.pdf' : '-report.pdf');

        return [$pdf->Output('', 'S'), $file];
    }

    /**
     * What would stop a real close, in plain English (the PDF is English only).
     *
     * @param  list<array{code: string, data: array<string,mixed>}>  $blocks
     * @return list<string>
     */
    private function warnings(array $blocks): array
    {
        return array_map(fn (array $b) => match ($b['code']) {
            'previous_month_open' => 'An earlier month is still open.',
            'pending_expenses' => $b['data']['count'].' expense(s) are still pending approval and are not counted.',
            'zero_meals_unresolved' => 'Nobody has meals this month: choose what happens to the food cost.',
            'unallocated' => 'Some bill amounts are not fully shared out yet.',
            'doesnt_pay_mismatch' => 'A "doesn\'t pay" split does not add up.',
            'cash_mismatch' => 'The cash in hand does not match the books.',
            default => 'Something would stop this month from closing.',
        }, $blocks);
    }

    /** @return list<array{name: string, amount: int, count: int}> biggest first */
    private function spendingByCategory(array $expenses): array
    {
        return collect($expenses)->groupBy('category')
            ->map(fn ($rows, $name) => ['name' => $name ?: 'Other', 'amount' => (int) $rows->sum('amount_paisa'), 'count' => $rows->count()])
            ->sortByDesc('amount')->values()->all();
    }

    /** @return list<array{id: int, name: string}> the next month's categories, in first-seen order */
    private function nextColumns(array $rows): array
    {
        return collect($rows)->flatMap(fn ($r) => $r['by_category'])
            ->unique('category_id')->map(fn ($c) => ['id' => $c['category_id'], 'name' => $c['name']])->values()->all();
    }
}
