<?php

use App\Http\Controllers\Member\RoleController;
use App\Http\Controllers\Mess\MessController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'phone.verified'])->group(function () {
    Route::post('messes', [MessController::class, 'store']);
});

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('/', [MessController::class, 'show']);

    Route::middleware('mess.role:admin')->group(function () {
        Route::post('admin', [RoleController::class, 'transferAdmin']);
        Route::post('manager', [RoleController::class, 'assignManager']);
    });
});
