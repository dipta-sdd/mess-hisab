<?php

use App\Http\Controllers\Cash\CashController;
use App\Http\Controllers\Payment\PaymentController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('payments', [PaymentController::class, 'index']);
    Route::get('cash', [CashController::class, 'show']);

    Route::middleware('mess.role:manager')->group(function () {
        Route::post('payments', [PaymentController::class, 'store']);
        Route::patch('payments/{payment}', [PaymentController::class, 'update']);
        Route::delete('payments/{payment}', [PaymentController::class, 'destroy']);
    });
});
