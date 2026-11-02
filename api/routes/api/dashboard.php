<?php

use App\Http\Controllers\Balance\DashboardController;
use App\Http\Controllers\Balance\HistoryController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('dashboard', [DashboardController::class, 'show']);
    Route::get('history', [HistoryController::class, 'index']);
});
