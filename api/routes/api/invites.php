<?php

use App\Http\Controllers\Invite\InviteController;
use App\Http\Controllers\Invite\PublicInviteController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess', 'mess.role:admin,manager'])->prefix('messes/{mess}/invites')->group(function () {
    Route::get('/', [InviteController::class, 'index']);
    Route::post('/', [InviteController::class, 'store']);
    Route::delete('{invite}', [InviteController::class, 'destroy']);
});

Route::get('invites/{token}', [PublicInviteController::class, 'show'])->middleware('throttle:30,1');
Route::post('invites/{token}/accept', [PublicInviteController::class, 'accept'])->middleware(['auth:sanctum', 'throttle:20,1']);
