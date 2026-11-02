<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecoverableShare extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'manual_amount_paisa' => 'integer',
            'amount_paisa' => 'integer',
        ];
    }

    public function recoverable(): BelongsTo
    {
        return $this->belongsTo(Recoverable::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'member_id');
    }
}
