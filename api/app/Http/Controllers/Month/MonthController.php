<?php

namespace App\Http\Controllers\Month;

use App\Http\Controllers\Controller;
use App\Http\Resources\MonthResource;
use App\Models\Mess;
use App\Models\Month;
use App\Services\Month\Calendar;
use App\Services\Month\CalendarException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MonthController extends Controller
{
    public function index(Mess $mess): AnonymousResourceCollection
    {
        return MonthResource::collection(Month::query()->orderByDesc('starts_on')->get());
    }

    public function current(Mess $mess, Calendar $calendar): JsonResponse
    {
        try {
            // A just-created model would make the resource answer 201; this is a GET, always 200.
            return (new MonthResource($calendar->currentMonth($mess)))->response()->setStatusCode(200);
        } catch (CalendarException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->reason], 409);
        }
    }

    public function show(Mess $mess, Month $month): MonthResource
    {
        return new MonthResource($month);
    }
}
