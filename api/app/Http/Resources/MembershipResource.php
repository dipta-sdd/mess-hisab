<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A MessMember row seen from its user's side; needs the `mess` relation loaded. @mixin \App\Models\MessMember */
class MembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'mess_id' => $this->mess_id,
            'mess_name' => $this->mess->name,
            'member_id' => $this->id,
            'is_admin' => $this->isAdmin(),
            'is_manager' => $this->isManager(),
            'archived' => $this->isArchived(),
        ];
    }
}
