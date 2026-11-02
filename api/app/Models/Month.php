<?php

namespace App\Models;

use App\Enums\MonthStatus;
use App\Enums\ZeroMealResolution;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Month extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'status' => MonthStatus::class,
            'fixed_deadline' => 'date',
            'deposit_deadline' => 'date',
            'deposit_paisa' => 'integer',
            'zero_meal_resolution' => ZeroMealResolution::class,
            'food_carry_in_paisa' => 'integer',
            'food_carry_out_paisa' => 'integer',
            'closed_at' => 'datetime',
            'reopened_at' => 'datetime',
        ];
    }

    public function bills(): HasMany
    {
        return $this->hasMany(MonthBill::class);
    }

    public function chargeOverrides(): HasMany
    {
        return $this->hasMany(ChargeOverride::class);
    }

    public function memberSettings(): HasMany
    {
        return $this->hasMany(MemberMonthSetting::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    public function mealEntries(): HasMany
    {
        return $this->hasMany(MealEntry::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(LedgerEntry::class);
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'closed_by_member_id');
    }

    public function isOpen(): bool
    {
        return $this->status === MonthStatus::Open;
    }
}
