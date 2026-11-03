<?php

use App\Http\Controllers\Meal\MealController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('meals', [MealController::class, 'index']);
    // Who may write (manager / self) depends on the mess setting, so MealWriter checks it.
    Route::put('meals', [MealController::class, 'upsert']);

    Route::middleware('mess.role:admin,manager')->put('meals/bulk', [MealController::class, 'bulk']);
});
