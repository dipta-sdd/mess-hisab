<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Expense */
class ExpenseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'month_id' => $this->month_id,
            'category_id' => $this->category_id,
            'amount_paisa' => $this->amount_paisa,
            'spent_on' => $this->spent_on->toDateString(),
            'note' => $this->note,
            'paid_by' => $this->paid_by->value,
            'paid_by_member_id' => $this->paid_by_member_id,
            'status' => $this->status->value,
            'is_late' => $this->is_late,
            'short_cash_converted' => $this->short_cash_converted,
            'is_self_recorded' => $this->is_self_recorded,
            'created_by_member_id' => $this->created_by_member_id,
            'approved_by_member_id' => $this->approved_by_member_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
