<?php

use App\Http\Controllers\Export\ExportController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess', 'mess.role:admin,manager'])->prefix('messes/{mess}')->group(function () {
    Route::post('exports', [ExportController::class, 'store']);
    Route::get('exports/{export}', [ExportController::class, 'show'])->whereNumber('export');
    Route::get('exports/{export}/download', [ExportController::class, 'download'])->whereNumber('export');
});
