<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Needs the `mess` relation set (controllers do this once per request). @mixin \App\Models\MessMember */
class MemberResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'display_name' => $this->display_name,
            'user_id' => $this->user_id,
            'has_account' => $this->user_id !== null,
            'is_admin' => $this->isAdmin(),
            'is_manager' => $this->isManager(),
            'joined_on' => $this->joined_on?->toDateString(),
            'left_on' => $this->left_on?->toDateString(),
            'archived_at' => $this->archived_at?->toIso8601String(),
        ];
    }
}
