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
        $data = $this->report->build($mess, $month);

        $html = view('reports.monthly-pdf', [
            'r' => $data,
            // A no-break space so "Tk 1,344.01" never splits across lines in a narrow column.
            'tk' => fn (int $paisa) => str_replace(' ', "\u{00A0}", self::money($paisa)),
            'monthName' => fn (string $date) => CarbonImmutable::parse($date)->format('F Y'),
            'day' => fn (?string $date) => $date ? CarbonImmutable::parse($date)->format('j M Y') : null,
            'categories' => $this->spendingByCategory($data['expenses']),
            'nextColumns' => $this->nextColumns($data['next_month']['rows']),
        ])->render();

        $pdf = new Mpdf([
            'mode' => 'utf-8', 'format' => 'A4', 'tempDir' => storage_path('framework/cache/mpdf'),
            'margin_left' => 12, 'margin_right' => 12, 'margin_top' => 12, 'margin_bottom' => 12,
            'shrink_tables_to_fit' => 1,
        ]);
        $pdf->SetTitle($mess->name.' - '.CarbonImmutable::parse($data['month']['starts_on'])->format('F Y').' report');
        $pdf->WriteHTML($html);

        $file = Str::slug($mess->name).'-'.substr($data['month']['starts_on'], 0, 7).'-report.pdf';

        return [$pdf->Output('', 'S'), $file];
    }

    /** "Tk 1,344.01", "Tk 3,500", "-Tk 3,511". */
    public static function money(int $paisa): string
    {
        return Money::tk($paisa);
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
