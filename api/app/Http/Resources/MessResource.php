<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Mess */
class MessResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'currency' => $this->currency,
            'month_start_day' => (int) $this->month_start_day,
            'admin_member_id' => $this->admin_member_id === null ? null : (int) $this->admin_member_id,
            'manager_member_id' => $this->manager_member_id === null ? null : (int) $this->manager_member_id,
            'approval_required' => (bool) $this->approval_required,
            'rounding_mode' => $this->rounding_mode->value,
            'meal_tracking' => $this->meal_tracking->value,
            'meal_entry_by' => $this->meal_entry_by->value,
            'breakfast_weight_centi' => (int) $this->breakfast_weight_centi,
            'lunch_weight_centi' => (int) $this->lunch_weight_centi,
            'dinner_weight_centi' => (int) $this->dinner_weight_centi,
            'min_meals_enabled' => (bool) $this->min_meals_enabled,
            'min_meals_centi' => $this->min_meals_centi,
            'min_payable_enabled' => (bool) $this->min_payable_enabled,
            'min_payable_paisa' => $this->min_payable_paisa,
            'deposit_paisa' => (int) $this->deposit_paisa,
            'fixed_due_day_offset' => (int) $this->fixed_due_day_offset,
            'deposit_due_day_offset' => (int) $this->deposit_due_day_offset,
        ];
    }
}
