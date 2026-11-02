<?php

namespace App\Http\Resources\Balance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Wraps the array built by BalanceViews; the keys are the contract (docs/contract-fixtures). */
class DashboardResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        return $this->resource;
    }
}
