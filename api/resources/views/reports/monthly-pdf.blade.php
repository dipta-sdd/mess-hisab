@php
    $s = $r['summary'];
    $next = $r['next_month'];
    $isPreview = isset($r['preview']);
    $meals = $r['meals'];
@endphp
<html>
<head>
<style>
    body { font-family: dejavusans; font-size: 10pt; color: #1f2933; }
    h1 { font-size: 20pt; margin: 2pt 0 0; color: #0f3d5c; }
    h2 { font-size: 12pt; margin: 22pt 0 8pt; color: #0f3d5c; border-bottom: 1px solid #0f3d5c; padding-bottom: 4pt; }
    .muted { color: #6b7785; }
    .head td { vertical-align: bottom; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
    .grid th { background: #eef2f6; font-size: 8.5pt; text-align: right; padding: 7pt 8pt; color: #3d4852; vertical-align: bottom; }
    .grid th.l, .grid td.l { text-align: left; }
    .grid td { text-align: right; padding: 8pt 7pt; white-space: nowrap; border-bottom: 1px solid #e3e8ed; }
    .due { color: #b42318; font-weight: bold; }
    .credit { color: #067647; font-weight: bold; }
    .note { margin-top: 6pt; font-size: 8pt; color: #6b7785; }
    .preview { border: 1px solid #b54708; background: #fffaeb; color: #93370d; padding: 7pt 9pt; margin-bottom: 10pt; font-size: 9pt; }
    .foot { margin-top: 26pt; font-size: 8pt; color: #8a94a0; border-top: 1px solid #e3e8ed; padding-top: 6pt; }
</style>
</head>
<body>
@if ($isPreview)
    <div class="preview">
        <b>PREVIEW &ndash; this month is not closed.</b> Nothing has been saved; the figures are as they stand today and can still change.
        @foreach ($warnings as $w) <br>&bull; {{ $w }} @endforeach
    </div>
@endif

<table class="head">
    <tr>
        <td>
            <div class="muted">{{ $r['mess']['name'] }}</div>
            <h1>{{ $monthName($r['month']['starts_on']) }} report @if ($isPreview) <span style="color:#b54708;">(preview)</span>@endif</h1>
        </td>
        <td style="text-align: right;" class="muted">
            {{ $day($r['month']['starts_on']) }} – {{ $day($r['month']['ends_on']) }}<br>
            {{ $s['member_count'] }} members · {{ $s['expense_count'] }} expenses<br>
            @if ($meals) Meal rate {{ $tk($meals['meal_rate_paisa']) }}<br> @endif
            @if ($r['month']['closed_at']) Closed {{ $day($r['month']['closed_at']) }} @endif
        </td>
    </tr>
</table>

<h2>Each person this month</h2>
<table class="grid">
    <tr>
        <th class="l">Member</th>
        <th>Carried in</th>
        <th>Fixed bills</th>
        <th>{{ $meals ? 'Meals' : 'Shared spending' }}</th>
        <th>Charged</th>
        <th>Paid in</th>
        <th>Spent from pocket</th>
        <th style="width: 20%; white-space: nowrap;">Result</th>
    </tr>
    @foreach ($r['members'] as $m)
        <tr>
            <td class="l"><b>{{ $m['display_name'] }}</b></td>
            <td>{{ $tk($m['carry_in_paisa']) }}</td>
            <td>{{ $tk($m['fixed_bill_paisa']) }}</td>
            <td>{{ $tk($m['meals_bill_paisa']) }}</td>
            <td>{{ $tk($m['share_paisa']) }}</td>
            <td>{{ $tk($m['paid_paisa']) }}</td>
            <td>{{ $tk($m['spent_paisa']) }}</td>
            <td>
                @if ($m['balance_paisa'] < 0) <span class="due">Due&nbsp;{{ $tk(-$m['balance_paisa']) }}</span>
                @elseif ($m['balance_paisa'] > 0) <span class="credit">Credit&nbsp;{{ $tk($m['balance_paisa']) }}</span>
                @else Settled @endif
            </td>
        </tr>
    @endforeach
</table>

@php $c = $r['cash']; @endphp
<h2>Cash in the manager's hand <span class="muted" style="font-weight: normal;">· paid from mess cash this month {{ $tk($s['cash_spent_paisa']) }}</span></h2>
<table class="grid">
    <tr><td class="l">Members are owed</td><td>{{ $tk($c['owed_to_members_paisa']) }}</td></tr>
    <tr><td class="l">Members owe</td><td>&minus;{{ $tk($c['owed_by_members_paisa']) }}</td></tr>
    <tr><td class="l">Bills charged but not yet paid out</td><td>{{ $tk($c['unpaid_fixed_bills_paisa']) }}</td></tr>
    @if ($c['other_paisa'] !== 0)<tr><td class="l">Other (rounding, carried food)</td><td>{{ $tk($c['other_paisa']) }}</td></tr>@endif
    <tr><td class="l"><b>Cash in hand</b></td><td><b>{{ $tk($c['in_hand_paisa']) }}</b></td></tr>
</table>
@if ($s['shared_extra_paisa'] > 0)
    <div class="note">Spare cash of {{ $tk($s['shared_extra_paisa']) }} was shared equally as extra credit for next month.</div>
@elseif ($c['extra_paisa'] > 0)
    <div class="note">{{ $tk($c['extra_paisa']) }} of the cash is not covered by any balance and can be shared equally when the month is closed.</div>
@endif

<h2>Where the money went</h2>
<table class="grid">
    <tr><th class="l">Category</th><th>Entries</th><th>Amount</th><th>Share of total</th></tr>
    @foreach ($categories as $c)
        <tr>
            <td class="l">{{ $c['name'] }}</td>
            <td>{{ $c['count'] }}</td>
            <td>{{ $tk($c['amount']) }}</td>
            <td>{{ $s['expenses_paisa'] > 0 ? round($c['amount'] * 100 / $s['expenses_paisa']) : 0 }}%</td>
        </tr>
    @endforeach
    @if (count($categories) === 0)
        <tr><td class="l muted" colspan="4">No expenses this month.</td></tr>
    @endif
</table>

@if ($next)
@php $nextName = $monthName($next['month']['starts_on']); @endphp
<h2>To pay for {{ $nextName }}@if ($next['fixed_deadline']) <span class="muted" style="font-weight: normal;">· by {{ $day($next['fixed_deadline']) }}</span>@endif</h2>
@php $w = round(78 / (count($nextColumns) + 2), 1); @endphp
<table class="grid">
    <tr>
        <th class="l" style="width: 22%;">Member</th>
        @foreach ($nextColumns as $col) <th style="width: {{ $w }}%;">{{ $col['name'] }}</th> @endforeach
        <th style="width: {{ $w }}%;">Last month due</th>
        <th style="width: {{ $w }}%;">Total to pay</th>
    </tr>
    @foreach ($next['rows'] as $row)
        @php $byId = collect($row['by_category'])->keyBy('category_id'); @endphp
        <tr>
            <td class="l"><b>{{ $row['display_name'] }}</b></td>
            @foreach ($nextColumns as $col) <td>{{ $tk($byId[$col['id']]['amount_paisa'] ?? 0) }}</td> @endforeach
            <td>{{ $tk($row['last_month_due_paisa'] - $row['last_month_credit_paisa']) }}</td>
            <td><b>{{ $tk($row['total_paisa']) }}</b></td>
        </tr>
    @endforeach
</table>
<div class="note">A minus in "Last month due" is credit left over from {{ $monthName($r['month']['starts_on']) }}; it is taken off the total. @if ($isPreview) Estimate: based on today's figures and the bills entered for the preview.@endif</div>
@endif

<div class="foot">Mess Hisab · generated {{ now()->format('j M Y, g:i A') }}</div>
</body>
</html>
