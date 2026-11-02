<?php

namespace App\Models;

use App\Enums\Group;
use App\Enums\SplitType;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\BelongsToMess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    use HasFactory, BelongsToMess, Auditable;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'group' => Group::class,
            'split_type' => SplitType::class,
            'sort' => 'integer',
            'is_default' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }
}
