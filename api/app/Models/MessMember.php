<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MessMember extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'joined_on' => 'date',
            'left_on' => 'date',
            'archived_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'member_id');
    }

    public function mealEntries(): HasMany
    {
        return $this->hasMany(MealEntry::class, 'member_id');
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(LedgerEntry::class, 'member_id');
    }

    public function isAdmin(): bool
    {
        return $this->mess->admin_member_id === $this->id;
    }

    public function isManager(): bool
    {
        return $this->mess->manager_member_id === $this->id;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** Active in a month per CONTRACT §3: joined by its end, not left before its start. */
    public function isActiveIn(Month $month): bool
    {
        return $this->joined_on->lte($month->ends_on)
            && ($this->left_on === null || $this->left_on->gte($month->starts_on));
    }

    public function scopeActiveIn(Builder $query, Month $month): Builder
    {
        return $query->whereDate('joined_on', '<=', $month->ends_on)
            ->where(fn ($q) => $q->whereNull('left_on')->orWhereDate('left_on', '>=', $month->starts_on));
    }
}
