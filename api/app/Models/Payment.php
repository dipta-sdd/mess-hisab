<?php

namespace App\Models;

use App\Enums\Group;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use HasFactory, BelongsToMess, Auditable, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'group' => Group::class,
            'amount_paisa' => 'integer',
            'paid_on' => 'date',
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

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'received_by_member_id');
    }
}
