<?php

namespace App\Models;

use App\Enums\ExpenseStatus;
use App\Enums\PaidBy;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Expense extends Model
{
    use HasFactory, BelongsToMess, Auditable, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'amount_paisa' => 'integer',
            'spent_on' => 'date',
            'paid_by' => PaidBy::class,
            'status' => ExpenseStatus::class,
            'approved_at' => 'datetime',
            'is_late' => 'boolean',
            'short_cash_converted' => 'boolean',
            'is_self_recorded' => 'boolean',
        ];
    }

    public function month(): BelongsTo
    {
        return $this->belongsTo(Month::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function paidByMember(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'paid_by_member_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'created_by_member_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'approved_by_member_id');
    }
}
