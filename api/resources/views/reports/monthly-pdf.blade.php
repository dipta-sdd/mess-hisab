@php
    $s = $r['summary'];
    $next = $r['next_month'];
    $nextName = $monthName($next['month']['starts_on']);
    $meals = $r['meals'];
@endphp
<html>
<head>
<style>
    body { font-family: dejavusans; font-size: 9pt; color: #1f2933; }
    h1 { font-size: 17pt; margin: 0; color: #0f3d5c; }
    h2 { font-size: 10.5pt; margin: 12pt 0 4pt; color: #0f3d5c; border-bottom: 1px solid #0f3d5c; padding-bottom: 2pt; }
    .muted { color: #6b7785; }
    .head td { vertical-align: bottom; }
    table { border-collapse: collapse; width: 100%; }
    .tiles td { border: 1px solid #d5dbe1; padding: 5pt 6pt; width: 16%; }
    .tlabel { font-size: 7pt; color: #6b7785; text-transform: uppercase; }
    .tvalue { font-size: 12pt; font-weight: bold; }
    .grid th { background: #eef2f6; font-size: 7.5pt; text-align: right; padding: 4pt 5pt; color: #3d4852; }
    .grid th.l, .grid td.l { text-align: left; }
    .grid td { text-align: right; padding: 4pt 5pt; border-bottom: 1px solid #e3e8ed; }
    .grid tr.total td { font-weight: bold; border-top: 1.5px solid #1f2933; border-bottom: none; }
    .due { color: #b42318; font-weight: bold; }
    .credit { color: #067647; font-weight: bold; }
    .note { font-size: 7pt; color: #6b7785; }
    .foot { margin-top: 14pt; font-size: 7pt; color: #8a94a0; border-top: 1px solid #e3e8ed; padding-top: 4pt; }
</style>
</head>
<body>

<table class="head">
    <tr>
        <td>
            <div class="muted">{{ $r['mess']['name'] }}</div>
            <h1>{{ $monthName($r['month']['starts_on']) }} report</h1>
        </td>
        <td style="text-align: right;" class="muted">
            {{ $day($r['month']['starts_on']) }} – {{ $day($r['month']['ends_on']) }}<br>
            {{ $s['member_count'] }} members · {{ $s['expense_count'] }} expenses<br>
            @if ($r['month']['closed_at']) Closed {{ $day($r['month']['closed_at']) }} @endif
        </td>
    </tr>
</table>

<h2>Summary</h2>
<table class="tiles">
    <tr>
        <td><div class="tlabel">Total spent</div><div class="tvalue">{{ $tk($s['expenses_paisa']) }}</div></td>
        <td><div class="tlabel">Charged to members</div><div class="tvalue">{{ $tk($s['charged_paisa']) }}</div></td>
        <td><div class="tlabel">Paid in</div><div class="tvalue">{{ $tk($s['paid_paisa']) }}</div></td>
        <td><div class="tlabel">Spent from own pocket</div><div class="tvalue">{{ $tk($s['spent_paisa']) }}</div></td>
        <td><div class="tlabel">Left to pay</div><div class="tvalue due">{{ $tk($s['total_due_paisa']) }}</div></td>
        <td><div class="tlabel">{{ $meals ? 'Meal rate' : 'Left as credit' }}</div><div class="tvalue">{{ $meals ? $tk($meals['meal_rate_paisa']) : $tk($s['total_credit_paisa']) }}</div></td>
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
        <th>Result</th>
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
                @if ($m['balance_paisa'] < 0) <span class="due">Due {{ $tk(-$m['balance_paisa']) }}</span>
                @elseif ($m['balance_paisa'] > 0) <span class="credit">Credit {{ $tk($m['balance_paisa']) }}</span>
                @else Settled @endif
            </td>
        </tr>
    @endforeach
</table>

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
<div class="note">A minus in "Last month due" is credit left over from {{ $monthName($r['month']['starts_on']) }}; it is taken off the total.</div>

<div class="foot">Mess Hisab · generated {{ now()->format('j M Y, g:i A') }}</div>
</body>
</html>
