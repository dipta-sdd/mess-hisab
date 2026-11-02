<?php

namespace App\Models;

use App\Enums\Group;
use App\Enums\LedgerType;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class LedgerEntry extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'group' => Group::class,
            'type' => LedgerType::class,
            'amount_paisa' => 'integer',
            'meta' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function month(): BelongsTo
    {
        return $this->belongsTo(Month::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'member_id');
    }

    public function source(): MorphTo
    {
        return $this->morphTo();
    }
}
