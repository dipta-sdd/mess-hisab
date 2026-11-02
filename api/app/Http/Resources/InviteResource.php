<?php

namespace App\Http\Resources;

use App\Services\Auth\FrontendUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Invite */
class InviteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'token' => $this->token,
            'url' => FrontendUrl::to('invite/'.$this->token),
            'member_id' => $this->member_id,
            'expires_at' => $this->expires_at?->toIso8601String(),
            'max_uses' => $this->max_uses,
            'uses' => (int) $this->uses,
            'revoked_at' => $this->revoked_at?->toIso8601String(),
        ];
    }
}
