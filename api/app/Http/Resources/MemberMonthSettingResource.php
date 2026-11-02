<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\MemberMonthSetting */
class MemberMonthSettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'member_id' => (int) $this->member_id,
            'deposit_paisa' => $this->deposit_paisa === null ? null : (int) $this->deposit_paisa,
            'min_meals_centi' => $this->min_meals_centi === null ? null : (int) $this->min_meals_centi,
        ];
    }
}
