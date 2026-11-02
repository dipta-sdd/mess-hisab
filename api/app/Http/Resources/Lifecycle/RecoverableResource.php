<?php

namespace App\Http\Resources\Lifecycle;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Recoverable.json. Needs the `shares` relation loaded (controllers do). `amount_paisa` and the shares'
 * `amount_paisa` are null while the request is still `pending`; they are set at close.
 *
 * @mixin \App\Models\Recoverable
 */
class RecoverableResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'month_id' => $this->month_id,
            'debtor_member_id' => $this->debtor_member_id,
            'mode' => $this->mode->value,
            'status' => $this->status->value,
            'amount_paisa' => $this->amount_paisa,
            'repaid_paisa' => $this->repaid_paisa,
            'shares' => $this->shares->sortBy('member_id')->values()->map(fn ($s) => [
                'member_id' => $s->member_id,
                'amount_paisa' => $s->amount_paisa,
                'manual_amount_paisa' => $s->manual_amount_paisa,
            ])->all(),
        ];
    }
}
