<?php

namespace App\Http\Resources\Lifecycle;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\LedgerEntry */
class AdjustmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'month_id' => $this->month_id,
            'member_id' => $this->member_id,
            'group' => $this->group->value,
            'amount_paisa' => $this->amount_paisa,
            'note' => $this->note,
            'created_by_member_id' => $this->created_by_member_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
