<?php

namespace App\Http\Controllers\Meal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Meal\MealBulkRequest;
use App\Http\Requests\Meal\MealUpsertRequest;
use App\Http\Resources\MealEntryResource;
use App\Models\MealEntry;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Meal\MealRules;
use App\Services\Meal\MealWriter;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** The model's Auditable trait writes meal_entry.created|updated|deleted. */
class MealController extends Controller
{
    public function index(Request $request, Mess $mess, Calendar $calendar): JsonResponse
    {
        $data = $request->validate([
            'month_id' => ['sometimes', 'integer', Rule::exists('months', 'id')->where('mess_id', $mess->id)],
        ]);

        try {
            $month = isset($data['month_id']) ? Month::findOrFail($data['month_id']) : $calendar->currentMonth($mess);
        } catch (CalendarException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->reason], 409);
        }

        $entries = MealEntry::query()->where('month_id', $month->id)
            ->orderBy('entry_date')->orderBy('member_id')->get();

        // Everyone active in the month gets a row (zeros), so the web can show a full grid.
        $totals = MessMember::query()
            ->where('joined_on', '<=', $month->ends_on->toDateString())
            ->where(fn ($q) => $q->whereNull('left_on')->orWhere('left_on', '>=', $month->starts_on->toDateString()))
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['meals_centi' => 0, 'guest_meals_centi' => 0]])
            ->all();
        foreach ($entries as $e) {
            $t = $totals[$e->member_id] ?? ['meals_centi' => 0, 'guest_meals_centi' => 0];
            $t['meals_centi'] += $e->meals_centi;
            $t['guest_meals_centi'] += $e->guest_meals_centi;
            $totals[$e->member_id] = $t;
        }

        return response()->json(['data' => [
            'month_id' => $month->id,
            'style' => MealRules::style($mess)->value,
            'entries' => MealEntryResource::collection($entries)->resolve($request),
            'totals' => (object) $totals,
        ]]);
    }

    public function upsert(MealUpsertRequest $request, Mess $mess, MealWriter $writer): JsonResponse
    {
        $entry = DB::transaction(fn () => $writer->upsert($mess, currentMember(), $request->validated()));

        // 200 for both create and update: it is an upsert.
        return (new MealEntryResource($entry))->response()->setStatusCode(200);
    }

    public function bulk(MealBulkRequest $request, Mess $mess, MealWriter $writer, Calendar $calendar): AnonymousResourceCollection
    {
        $items = $request->validated()['entries'];

        // The same member + effective day twice would silently overwrite itself: reject up front.
        $monthTotal = MealRules::style($mess)->value === 'month_total';
        $seen = [];
        foreach ($items as $i => $item) {
            $day = $item['entry_date'];
            if ($monthTotal) {
                try {
                    $day = $calendar->monthFor($mess, $day)->starts_on->toDateString();
                } catch (CalendarException) {
                    // the writer reports the real error with its index
                }
            }
            $key = $item['member_id'].'|'.$day;
            if (isset($seen[$key])) {
                throw ValidationException::withMessages([
                    "entries.$i.entry_date" => [__('Duplicate of entries.:index (same member and day).', ['index' => $seen[$key]])],
                ]);
            }
            $seen[$key] = $i;
        }

        $entries = DB::transaction(function () use ($items, $mess, $writer) {
            $me = currentMember();

            return collect($items)->map(fn ($item, $i) => $writer->upsert($mess, $me, $item, "entries.$i."))->all();
        });

        return MealEntryResource::collection(collect($entries));
    }
}
