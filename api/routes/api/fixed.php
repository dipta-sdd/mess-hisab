<?php

use App\Http\Controllers\Setup\BillController;
use App\Http\Controllers\Setup\MemberSettingController;
use App\Http\Controllers\Setup\SetupController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('months/{month}/setup', [SetupController::class, 'show'])->whereNumber('month')->middleware('mess.role:admin,manager');

    Route::middleware('mess.role:manager')->group(function () {
        Route::patch('months/{month}/setup', [SetupController::class, 'update'])->whereNumber('month');
        Route::put('months/{month}/bills/{category}', [BillController::class, 'update'])->whereNumber(['month', 'category']);
        Route::post('months/{month}/bills/{category}/spread', [BillController::class, 'spread'])->whereNumber(['month', 'category']);
        Route::post('months/{month}/bills/{category}/accept', [BillController::class, 'accept'])->whereNumber(['month', 'category']);
        Route::put('months/{month}/members/{member}/settings', [MemberSettingController::class, 'update'])->whereNumber(['month', 'member']);
    });
});
