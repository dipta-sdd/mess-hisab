<?php

use App\Http\Controllers\Lifecycle\AdjustmentController;
use App\Http\Controllers\Lifecycle\DoesntPayController;
use App\Http\Controllers\Lifecycle\FinalSettlementController;
use App\Http\Controllers\Lifecycle\MonthLifecycleController;
use App\Http\Controllers\Lifecycle\RecoverableController;
use Illuminate\Support\Facades\Route;

// Task K: month lifecycle (close / reopen), adjustments, doesn't-pay, recoverables, final settlement.
Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('adjustments', [AdjustmentController::class, 'index']);
    Route::get('recoverables', [RecoverableController::class, 'index']);

    Route::middleware('mess.role:manager')->group(function () {
        Route::get('months/{month}/close-check', [MonthLifecycleController::class, 'closeCheck'])->whereNumber('month');
        Route::post('months/{month}/close', [MonthLifecycleController::class, 'close'])->whereNumber('month');
        Route::get('months/{month}/reopen-preview', [MonthLifecycleController::class, 'reopenPreview'])->whereNumber('month');
        Route::post('months/{month}/reopen', [MonthLifecycleController::class, 'reopen'])->whereNumber('month');

        Route::post('adjustments', [AdjustmentController::class, 'store']);

        Route::post('months/{month}/doesnt-pay', [DoesntPayController::class, 'store'])->whereNumber('month');
        Route::delete('months/{month}/doesnt-pay/{recoverable}', [DoesntPayController::class, 'destroy'])->whereNumber(['month', 'recoverable']);

        Route::post('recoverables/{recoverable}/repayments', [RecoverableController::class, 'repay'])->whereNumber('recoverable');
        Route::post('members/{member}/final-settlement', [FinalSettlementController::class, 'store'])->whereNumber('member');
    });
});
