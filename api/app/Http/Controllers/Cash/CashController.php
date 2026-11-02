<?php

namespace App\Http\Controllers\Cash;

use App\Http\Controllers\Controller;
use App\Models\Mess;
use App\Services\CashPool\CashPool;
use Illuminate\Http\JsonResponse;

class CashController extends Controller
{
    public function show(Mess $mess): JsonResponse
    {
        return response()->json(['data' => [
            'pool_balance_paisa' => CashPool::balance($mess),
            'manager_member_id' => $mess->manager_member_id,
        ]]);
    }
}
