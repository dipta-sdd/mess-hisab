<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\MealEntry */
class MealEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'member_id' => $this->member_id,
            'entry_date' => $this->entry_date->toDateString(),
            'breakfast' => $this->breakfast,
            'lunch' => $this->lunch,
            'dinner' => $this->dinner,
            'meals_centi' => $this->meals_centi,
            'guest_meals_centi' => $this->guest_meals_centi,
        ];
    }
}
