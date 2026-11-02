<?php

use App\Http\Controllers\Month\MonthController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('months', [MonthController::class, 'index']);
    // Declared before {month} so "current" is never taken as an id.
    Route::get('months/current', [MonthController::class, 'current']);
    Route::get('months/{month}', [MonthController::class, 'show'])->whereNumber('month');
});
