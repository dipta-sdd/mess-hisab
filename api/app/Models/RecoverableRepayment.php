<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecoverableRepayment extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'amount_paisa' => 'integer',
            'paid_on' => 'date',
        ];
    }

    public function recoverable(): BelongsTo
    {
        return $this->belongsTo(Recoverable::class);
    }

    public function month(): BelongsTo
    {
        return $this->belongsTo(Month::class);
    }
}
