<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Payment */
class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'month_id' => $this->month_id,
            'member_id' => $this->member_id,
            'group' => $this->group->value,
            'amount_paisa' => $this->amount_paisa,
            'paid_on' => $this->paid_on->toDateString(),
            'note' => $this->note,
            'received_by_member_id' => $this->received_by_member_id,
        ];
    }
}
