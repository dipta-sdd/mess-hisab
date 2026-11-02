<?php

use App\Http\Controllers\Member\MemberController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}/members')->group(function () {
    Route::get('/', [MemberController::class, 'index']);

    Route::middleware('mess.role:admin,manager')->group(function () {
        Route::post('/', [MemberController::class, 'store']);
        Route::patch('{member}', [MemberController::class, 'update']);
        Route::post('{member}/archive', [MemberController::class, 'archive']);
    });
});
