<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Wraps a bill view array from App\Services\Setup\BillSetup (not a model). */
class BillResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $bill = $this->resource;

        return [
            'category_id' => $bill['category_id'],
            'group' => $bill['group'],
            'split_type' => $bill['split_type'],
            'amount_paisa' => $bill['amount_paisa'],
            'overrides' => $bill['overrides'],
            // Always a JSON object keyed by member id, even when empty.
            'shares' => (object) $bill['shares'],
            'unallocated_paisa' => $bill['unallocated_paisa'],
            'unallocated_accepted' => $bill['unallocated_accepted'],
        ];
    }
}
