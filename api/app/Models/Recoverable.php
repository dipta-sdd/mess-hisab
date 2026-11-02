<?php

namespace App\Models;

use App\Enums\DoesntPayMode;
use App\Enums\RecoverableStatus;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Recoverable extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'mode' => DoesntPayMode::class,
            'status' => RecoverableStatus::class,
            'amount_paisa' => 'integer',
            'repaid_paisa' => 'integer',
            'undone_at' => 'datetime',
        ];
    }

    public function month(): BelongsTo
    {
        return $this->belongsTo(Month::class);
    }

    public function debtor(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'debtor_member_id');
    }

    public function shares(): HasMany
    {
        return $this->hasMany(RecoverableShare::class);
    }

    public function repayments(): HasMany
    {
        return $this->hasMany(RecoverableRepayment::class);
    }
}
