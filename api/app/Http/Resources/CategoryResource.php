<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Category */
class CategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'group' => $this->group->value,
            'name' => $this->name,
            'split_type' => $this->split_type->value,
            'sort' => (int) $this->sort,
            'is_default' => (bool) $this->is_default,
            'archived_at' => $this->archived_at?->toIso8601String(),
        ];
    }
}
