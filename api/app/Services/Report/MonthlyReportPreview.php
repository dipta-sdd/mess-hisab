<?php

namespace App\Services\Report;

use App\Enums\Group;
use App\Enums\MonthStatus;
use App\Enums\ZeroMealResolution;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use App\Services\Month\Lifecycle\CloseBillEdits;
use App\Services\Month\Lifecycle\CloseChecker;
use App\Services\Setup\BillSetup;
use Illuminate\Support\Facades\DB;

/**
 * The monthly report of a month that is NOT closed yet. It asks the same things as the close popup (zero-meal
 * choice, this month's fixed-bill edits) plus next month's Fixed bills, applies them, builds the report and
 * rolls everything back, so nothing is saved (not even the next month itself).
 */
class MonthlyReportPreview
{
    public function __construct(
        private readonly MonthlyReport $report,
        private readonly CloseChecker $checker,
        private readonly CloseBillEdits $edits,
        private readonly BillSetup $bills,
        private readonly Calendar $calendar,
    ) {}

    /**
     * What the next-month section of the popup starts from: next month's saved Fixed bills, or this month's when
     * next month has none yet. Saves nothing.
     *
     * @return array{next_month_exists: bool, bills: list<array>}
     */
    public function nextBills(Mess $mess, Month $month): array
    {
        $this->assertOpen($month);
        DB::beginTransaction();
        try {
            $next = $this->nextMonth($mess, $month);
            $fixed = fn (Month $m) => array_values(array_filter(
                $this->bills->billsFor($m), fn (array $b) => $b['group'] === Group::Fixed->value,
            ));
            $own = $fixed($next);
            $saved = array_filter($own, fn (array $b) => $b['amount_paisa'] > 0) !== [];

            return ['next_month_exists' => $saved, 'bills' => $saved ? $own : $fixed($month)];
        } finally {
            DB::rollBack();
        }
    }

    /**
     * @param  list<array<string,mixed>>  $thisEdits  as the close popup sends them
     * @param  list<array<string,mixed>>  $nextBills  next month's Fixed bills, the whole list: {category_id|name, amount_paisa?, overrides?}
     * @return array<string,mixed> the report data, plus `preview` => {blocks}
     */
    public function build(Mess $mess, Month $month, ?ZeroMealResolution $choice, array $thisEdits, array $nextBills): array
    {
        $this->assertOpen($month);

        DB::beginTransaction();
        try {
            $fresh = Month::query()->forMess($mess->id)->findOrFail($month->id);
            $this->edits->apply($mess, $fresh, $thisEdits);
            $ev = $this->checker->evaluate($mess, $fresh, $choice);

            $next = $this->nextMonth($mess, $fresh);
            $this->edits->apply($mess, $next, $nextBills, reuseByName: true);
            $billViews = array_values(array_filter(
                $this->bills->billsFor($next),
                fn (array $b) => $b['group'] === Group::Fixed->value && $b['amount_paisa'] > 0,
            ));

            $data = $this->report->assemble($mess, $fresh, $next, $billViews);
        } finally {
            DB::rollBack();
        }

        $data['preview'] = ['blocks' => $ev->blocks];

        return $data;
    }

    private function assertOpen(Month $month): void
    {
        if ($month->status !== MonthStatus::Open) {
            throw new ReportException(__('A preview is only available for a month that is not closed.'), 'month_closed');
        }
    }

    /** Created inside the rolled-back transaction when missing, even if it starts in the future. */
    private function nextMonth(Mess $mess, Month $month): Month
    {
        try {
            return $this->calendar->monthAfter($mess, $month);
        } catch (CalendarException) {
            throw new ReportException(__('Next month does not exist yet.'), 'next_month_missing');
        }
    }
}
