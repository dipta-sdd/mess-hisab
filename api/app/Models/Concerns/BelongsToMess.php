<?php

namespace App\Models\Concerns;

use App\Models\Mess;
use App\Support\MessContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Every mess-owned model uses this. While a MessContext is set, queries
 * (including route-model binding) only see rows of that mess, and new rows
 * get its mess_id. Outside a context (console, auth routes) nothing is
 * scoped: use ->forMess($id) explicitly there.
 */
trait BelongsToMess
{
    public static function bootBelongsToMess(): void
    {
        static::addGlobalScope('mess', function (Builder $query) {
            $messId = app(MessContext::class)->id();
            if ($messId !== null) {
                $query->where($query->getModel()->qualifyColumn('mess_id'), $messId);
            }
        });

        static::creating(function ($model) {
            if (empty($model->mess_id)) {
                $model->mess_id = app(MessContext::class)->id();
            }
        });
    }

    public function scopeForMess(Builder $query, int $messId): Builder
    {
        return $query->withoutGlobalScope('mess')->where($this->qualifyColumn('mess_id'), $messId);
    }

    public function mess(): BelongsTo
    {
        return $this->belongsTo(Mess::class);
    }
}
