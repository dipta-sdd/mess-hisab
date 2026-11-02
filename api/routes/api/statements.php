<?php

use App\Http\Controllers\Balance\StatementController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('statements/{member}', [StatementController::class, 'show'])->whereNumber('member');
});
