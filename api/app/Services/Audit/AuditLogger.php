<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use App\Support\MessContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/** Writes audit_logs rows. Actor and mess come from the auth user and MessContext. */
class AuditLogger
{
    public function __construct(private MessContext $context) {}

    public function log(string $event, ?Model $subject = null, array $before = [], array $after = [], array $meta = []): AuditLog
    {
        $messId = $this->context->id() ?? $subject?->getAttribute('mess_id');

        return AuditLog::forceCreate([
            'mess_id' => $messId,
            'user_id' => Auth::id(),
            'member_id' => $this->context->member()?->getKey(),
            'event' => $event,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'before' => $before ?: null,
            'after' => $after ?: null,
            'meta' => $meta ?: null,
            'created_at' => now(),
        ]);
    }
}
