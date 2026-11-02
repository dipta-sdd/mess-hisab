<?php

use App\Http\Controllers\Expense\ExpenseController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('expenses', [ExpenseController::class, 'index']);
    Route::post('expenses', [ExpenseController::class, 'store']);
    // Owner-or-manager rules are enforced in ExpenseService (they depend on status and month).
    Route::patch('expenses/{expense}', [ExpenseController::class, 'update']);
    Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy']);

    Route::middleware('mess.role:manager')->group(function () {
        Route::post('expenses/{expense}/approve', [ExpenseController::class, 'approve']);
        Route::post('expenses/{expense}/reject', [ExpenseController::class, 'reject']);
    });
});
