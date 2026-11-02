<?php

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Exports\Money;
use App\Jobs\Export\GenerateExport;
use App\Models\Export;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

require_once __DIR__.'/../Balance/BalanceHelpers.php';

beforeEach(fn () => Storage::fake('local'));
afterEach(fn () => $this->travelBack());

function lSheet(Export $export): Spreadsheet
{
    $export->refresh();

    return IOFactory::load(Storage::disk('local')->path($export->path));
}

function lRunJob(Export $export): void
{
    (new GenerateExport($export->mess_id, $export->id))->handle(
        app(App\Exports\MonthExportBuilder::class), app(App\Exports\StatementExportBuilder::class),
    );
}

/** Seeded PROJECT example 2 month; returns [mess, me, month, ids]. */
function lSeeded(string $role = 'member'): array
{
    [$mess, $me, $month, $ids] = jSetup($role);
    jToday('2026-11-12');
    jExample2($mess, $month, $ids);

    return [$mess, $me, $month, $ids];
}

it('formats paisa with integer maths', function () {
    expect(Money::taka(0))->toBe('0.00')
        ->and(Money::taka(5))->toBe('0.05')
        ->and(Money::taka(123456))->toBe('1234.56')
        ->and(Money::taka(-250))->toBe('-2.50')
        ->and(Money::taka(-5))->toBe('-0.05')
        ->and(Money::meals(250))->toBe('2.50');
});

it('queues a month export, returns 202 pending and passes the mess id explicitly', function () {
    Queue::fake();
    [$mess, $me, $month] = lSeeded();

    $res = $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->assertStatus(202);

    $json = $res->json('data');
    expectContractShape($json, 'Export');
    expect($json['status'])->toBe('queued')->and($json['type'])->toBe('month')->and($json['download_url'])->toBeNull();
    $export = Export::forMess($mess->id)->findOrFail($json['id']);
    expect($export->requested_by_member_id)->toBe($me->id)->and($export->params)->toBe(['month_id' => $month->id]);
    Queue::assertPushed(GenerateExport::class, fn ($job) => $job->messId === $mess->id && $job->exportId === $export->id);

    $log = \App\Models\AuditLog::query()->where('mess_id', $mess->id)->where('event', 'export.requested')->sole();
    expect($log->member_id)->toBe($me->id)->and($log->after['type'])->toBe('month');
});

it('writes a month workbook whose numbers equal the dashboard', function () {
    [$mess, , $month, $ids] = lSeeded();
    $dash = $this->getJson(messPath($mess, "dashboard?month_id={$month->id}"))->assertOk()->json('data');

    $id = $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->assertStatus(202)->json('data.id');
    $export = Export::forMess($mess->id)->findOrFail($id);
    expect($export->status)->toBe(ExportStatus::Done);

    $book = lSheet($export);
    expect($book->getSheetNames())->toBe(['Summary', 'Members', 'Expenses', 'Meals', 'Payments']);

    $summary = [];
    foreach ($book->getSheetByName('Summary')->toArray() as $row) {
        $summary[$row[0]] = $row[1];
    }
    $t = $dash['totals'];
    expect($summary['Fixed bills (BDT)'])->toBe(Money::taka($t['fixed_bills_paisa']))
        ->and($summary['Food cost (BDT)'])->toBe(Money::taka($t['food_cost_paisa']))
        ->and($summary['Meal rate (BDT)'])->toBe(Money::taka($t['meal_rate_paisa']))
        ->and($summary['Total meals'])->toBe(Money::meals($t['total_meals_centi']))
        ->and($summary['Total paid (BDT)'])->toBe(Money::taka($t['paid_paisa']))
        ->and($summary['Cash pool (BDT)'])->toBe(Money::taka($dash['cash_pool_paisa']))
        ->and($summary['Manager balance (BDT)'])->toBe(Money::taka($dash['manager_balance_paisa']));

    $rows = $book->getSheetByName('Members')->toArray();
    expect($rows)->toHaveCount(1 + count($ids));
    foreach ($dash['members'] as $i => $m) {
        $row = $rows[$i + 1];
        expect($row[0])->toBe($m['display_name'])
            ->and($row[3])->toBe(Money::taka($m['fixed_bill_paisa']))
            ->and($row[4])->toBe(Money::taka($m['meals_bill_paisa']))
            ->and($row[5])->toBe(Money::taka($m['paid_paisa']))
            ->and($row[8])->toBe(Money::taka($m['balance_paisa']));
    }

    // Expenses (3: two bazar + none else) / meals (3 entries) / payments (1)
    expect($book->getSheetByName('Expenses')->toArray())->toHaveCount(3)
        ->and($book->getSheetByName('Meals')->toArray())->toHaveCount(4)
        ->and($book->getSheetByName('Payments')->toArray()[1][3])->toBe('500.00');

    // Money cells are numbers (summable in Excel) shown with 2 decimals; text cells stay text.
    $cell = $book->getSheetByName('Payments')->getCell('D2');
    expect($cell->getDataType())->toBe(\PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_NUMERIC)
        ->and($cell->getValue())->toEqual(500)
        ->and($cell->getStyle()->getNumberFormat()->getFormatCode())->toBe('0.00')
        ->and($book->getSheetByName('Payments')->getCell('A1')->getDataType())->toBe(\PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);

    // Overdue days are never text: blank when not overdue (nobody is here), a number otherwise (next test).
    $members = $book->getSheetByName('Members');
    $last = $members->getHighestColumn();
    expect($members->getCell("{$last}1")->getValue())->toBe('Deposit overdue days')
        ->and($members->getCell("{$last}2")->getDataType())->not->toBe(\PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
});

it('writes integers such as overdue days as numbers', function () {
    $cell = (new Spreadsheet)->getActiveSheet()->getCell('A1');
    (new \App\Exports\ArraySheet('x', []))->bindValue($cell, 28);
    expect($cell->getDataType())->toBe(\PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_NUMERIC)
        ->and($cell->getValue())->toBe(28);
});

it('writes a statement workbook with the statement lines', function () {
    [$mess, , $month, $ids] = lSeeded();
    $x = $ids[0];
    $st = $this->getJson(messPath($mess, "statements/{$x}?month_id={$month->id}"))->assertOk()->json('data');

    $id = $this->postJson(messPath($mess, 'exports'), ['type' => 'statement', 'month_id' => $month->id, 'member_id' => $x])
        ->assertStatus(202)->json('data.id');
    $export = Export::forMess($mess->id)->findOrFail($id);
    expect($export->type)->toBe(ExportType::Statement)->and($export->status)->toBe(ExportStatus::Done);

    $rows = lSheet($export)->getSheetByName('Statement')->toArray();
    $header = array_search('Date', array_column($rows, 0), true);
    foreach ($st['lines'] as $i => $line) {
        $row = $rows[$header + 1 + $i];
        expect($row[1])->toBe($line['kind'])->and($row[3])->toBe($line['label'])->and($row[4])->toBe(Money::taka($line['amount_paisa']));
    }
    $totals = [];
    foreach ($rows as $row) {
        $totals[$row[3] ?? ''] = $row[4] ?? null;
    }
    expect($totals['Total (BDT)'])->toBe(Money::taka($st['total_paisa']))
        ->and($totals['Fixed balance (BDT)'])->toBe(Money::taka($st['fixed_balance_paisa']));
});

it('serves status and a private download once done', function () {
    [$mess, , $month] = lSeeded();
    $id = $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->json('data.id');

    $show = $this->getJson(messPath($mess, "exports/{$id}"))->assertOk()->json('data');
    expectContractShape($show, 'Export');
    expect($show['status'])->toBe('done')->and($show['download_url'])->toEndWith("/api/messes/{$mess->id}/exports/{$id}/download");

    $res = $this->get(messPath($mess, "exports/{$id}/download"))->assertOk();
    expect($res->headers->get('content-type'))->toContain('spreadsheetml')
        ->and(Export::forMess($mess->id)->find($id)->path)->toStartWith("exports/{$mess->id}/");
    Storage::disk('public')->assertMissing(Export::forMess($mess->id)->find($id)->path);
});

it('lets any member of the mess download, and 409s while not ready', function () {
    Queue::fake();
    [$mess, , $month] = lSeeded('member');
    $id = $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->json('data.id');

    $this->getJson(messPath($mess, "exports/{$id}/download"))->assertStatus(409)->assertJsonPath('code', 'export_not_ready');

    $other = MessMember::factory()->for($mess)->create();
    $this->actingAs($other->user);
    lRunJob(Export::forMess($mess->id)->findOrFail($id));
    $this->get(messPath($mess, "exports/{$id}/download"))->assertOk();
});

it('marks the export failed when generation throws', function () {
    Queue::fake();
    [$mess, , $month] = lSeeded();
    $id = $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->json('data.id');
    $export = Export::forMess($mess->id)->findOrFail($id);
    // The month vanishes between request and run (params point at nothing).
    $export->update(['params' => ['month_id' => 999999]]);

    lRunJob($export);

    $export->refresh();
    expect($export->status)->toBe(ExportStatus::Failed)->and($export->error)->not->toBeNull()->and($export->path)->toBeNull();
    $this->getJson(messPath($mess, "exports/{$id}"))->assertOk()->assertJsonPath('data.status', 'failed')->assertJsonPath('data.download_url', null);
});

it('runs the job without any request context and ignores other messes', function () {
    Queue::fake();
    [$mess, , $month] = lSeeded();
    $id = $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $month->id])->json('data.id');
    $export = Export::forMess($mess->id)->findOrFail($id);
    app(App\Support\MessContext::class)->clear();

    lRunJob($export);

    expect($export->refresh()->status)->toBe(ExportStatus::Done);
    // A job aimed at the wrong mess id finds nothing and writes nothing.
    $foreign = otherMess();
    (new GenerateExport($foreign->id, $export->id))->handle(app(App\Exports\MonthExportBuilder::class), app(App\Exports\StatementExportBuilder::class));
    expect($export->refresh()->path)->toBe("exports/{$mess->id}/{$export->id}-month.xlsx");
});

it('needs a login', function () {
    $mess = Mess::factory()->create();

    $this->postJson(messPath($mess, 'exports'), [])->assertUnauthorized();
    $this->getJson(messPath($mess, 'exports/1'))->assertUnauthorized();
    $this->getJson(messPath($mess, 'exports/1/download'))->assertUnauthorized();
});

it('validates the request', function () {
    Queue::fake();
    [$mess, , $month] = jSetup('member');

    $this->postJson(messPath($mess, 'exports'), [])->assertStatus(422)->assertJsonValidationErrors(['type', 'month_id']);
    $this->postJson(messPath($mess, 'exports'), ['type' => 'pdf', 'month_id' => $month->id])->assertStatus(422)->assertJsonValidationErrors(['type']);
    $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['month_id']);
    $this->postJson(messPath($mess, 'exports'), ['type' => 'statement', 'month_id' => $month->id])->assertStatus(422)->assertJsonValidationErrors(['member_id']);
    Queue::assertNothingPushed();
});

it('is 404 across messes on create, show and download', function () {
    Queue::fake();
    [$mess, , $month] = jSetup('member');
    $foreign = otherMess();
    $foreignMonth = Month::factory()->create(['mess_id' => $foreign->id]);
    $foreignExport = Export::factory()->create([
        'mess_id' => $foreign->id, 'requested_by_member_id' => $foreign->manager_member_id,
        'status' => ExportStatus::Done, 'path' => "exports/{$foreign->id}/1-month.xlsx",
    ]);
    $mine = Export::factory()->create(['mess_id' => $mess->id, 'requested_by_member_id' => $mess->manager_member_id]);

    // not a member of the foreign mess
    $this->postJson(messPath($foreign, 'exports'), ['type' => 'month', 'month_id' => $foreignMonth->id])->assertNotFound();
    $this->getJson(messPath($foreign, "exports/{$foreignExport->id}"))->assertNotFound();
    $this->getJson(messPath($foreign, "exports/{$foreignExport->id}/download"))->assertNotFound();
    // my mess, someone else's rows
    $this->postJson(messPath($mess, 'exports'), ['type' => 'month', 'month_id' => $foreignMonth->id])->assertNotFound();
    $this->postJson(messPath($mess, 'exports'), ['type' => 'statement', 'month_id' => $month->id, 'member_id' => $foreign->manager_member_id])->assertNotFound();
    $this->getJson(messPath($mess, "exports/{$foreignExport->id}"))->assertNotFound();
    $this->getJson(messPath($mess, "exports/{$foreignExport->id}/download"))->assertNotFound();
    $this->getJson(messPath($mess, "exports/{$mine->id}"))->assertOk();
    Queue::assertNothingPushed();
});
