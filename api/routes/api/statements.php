<?php

use App\Http\Controllers\Balance\MemberHistoryController;
use App\Http\Controllers\Balance\StatementController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('statements/{member}', [StatementController::class, 'show'])->whereNumber('member');
    Route::get('statements/{member}/history', [MemberHistoryController::class, 'index'])->whereNumber('member');
});
