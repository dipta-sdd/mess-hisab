<?php

namespace App\Http\Resources;

use App\Enums\ExportStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Export */
class ExportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'status' => $this->status->value,
            'created_at' => $this->created_at?->toIso8601String(),
            'download_url' => $this->status === ExportStatus::Done && $this->path
                ? url("/api/messes/{$this->mess_id}/exports/{$this->id}/download")
                : null,
        ];
    }
}
