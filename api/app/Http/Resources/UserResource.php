<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'phone_verified' => $this->hasVerifiedPhone(),
            'has_verified_contact' => $this->hasVerifiedContact(),
            'locale' => $this->locale,
            'has_password' => $this->password !== null,
            'has_google' => $this->google_id !== null,
        ];
    }
}
