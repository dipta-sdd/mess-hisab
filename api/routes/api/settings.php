<?php

use App\Http\Controllers\Settings\SettingsController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'mess', 'mess.role:admin'])->patch('messes/{mess}/settings', [SettingsController::class, 'update']);
