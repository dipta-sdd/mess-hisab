<?php

use App\Http\Controllers\Report\MonthlyReportController;
use Illuminate\Support\Facades\Route;

// Task R: monthly report (closed month + what each member pays for the next one). Every member of the mess may read it.
Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('reports/monthly/{month}', [MonthlyReportController::class, 'show'])->whereNumber('month');
    Route::get('reports/monthly/{month}/pdf', [MonthlyReportController::class, 'pdf'])->whereNumber('month');
});
