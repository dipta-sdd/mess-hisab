<?php

namespace App\Models;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Export extends Model
{
    use HasFactory, BelongsToMess;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'type' => ExportType::class,
            'params' => 'array',
            'status' => ExportStatus::class,
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'requested_by_member_id');
    }
}
