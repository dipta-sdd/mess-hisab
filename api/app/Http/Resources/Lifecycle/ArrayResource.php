<?php

namespace App\Http\Resources\Lifecycle;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Wraps an array built by a lifecycle service; the keys are the contract (docs/contract-fixtures). */
class ArrayResource extends JsonResource
{
    /** @return array<string,mixed> */
    public function toArray(Request $request): array
    {
        return $this->resource;
    }
}
