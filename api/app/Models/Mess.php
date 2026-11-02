<?php

namespace App\Models;

use App\Enums\MealEntryBy;
use App\Enums\MealTracking;
use App\Enums\RoundingMode;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mess extends Model
{
    use HasFactory, Auditable;

    protected $table = 'messes';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'month_start_day' => 'integer',
            'approval_required' => 'boolean',
            'rounding_mode' => RoundingMode::class,
            'meal_tracking' => MealTracking::class,
            'meal_entry_by' => MealEntryBy::class,
            'breakfast_weight_centi' => 'integer',
            'lunch_weight_centi' => 'integer',
            'dinner_weight_centi' => 'integer',
            'min_meals_enabled' => 'boolean',
            'min_meals_centi' => 'integer',
            'min_payable_enabled' => 'boolean',
            'min_payable_paisa' => 'integer',
            'deposit_paisa' => 'integer',
            'fixed_due_day_offset' => 'integer',
            'deposit_due_day_offset' => 'integer',
        ];
    }

    public function members(): HasMany
    {
        return $this->hasMany(MessMember::class);
    }

    public function months(): HasMany
    {
        return $this->hasMany(Month::class);
    }

    public function categories(): HasMany
    {
        return $this->hasMany(Category::class);
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'admin_member_id');
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(MessMember::class, 'manager_member_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function auditEventPrefix(): string
    {
        return 'mess';
    }
}
