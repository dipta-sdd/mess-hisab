<?php

use App\Http\Controllers\Report\MonthlyReportController;
use Illuminate\Support\Facades\Route;

// Task R: monthly report (closed month + what each member pays for the next one).
Route::middleware(['auth:sanctum', 'mess', 'mess.role:admin,manager'])->prefix('messes/{mess}')->group(function () {
    Route::get('reports/monthly/{month}', [MonthlyReportController::class, 'show'])->whereNumber('month');
});
