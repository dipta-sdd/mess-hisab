<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Month */
class MonthResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'status' => $this->status->value,
            'fixed_deadline' => $this->fixed_deadline?->toDateString(),
            'deposit_deadline' => $this->deposit_deadline?->toDateString(),
            'deposit_paisa' => (int) $this->deposit_paisa,
            'zero_meal_resolution' => $this->zero_meal_resolution?->value,
            'closed_at' => $this->closed_at?->toIso8601String(),
        ];
    }
}
