<?php

use App\Http\Controllers\Audit\AuditController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess'])->prefix('messes/{mess}')->group(function () {
    Route::get('audit', [AuditController::class, 'index']);
});
