<?php

namespace App\Models\Concerns;

use App\Services\Audit\AuditLogger;
use Illuminate\Support\Str;

/**
 * Logs <model>.created|updated|deleted automatically (event prefix = snake model name,
 * e.g. meal_entry.updated). Bulk query-builder writes bypass this: call AuditLogger yourself.
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(fn ($m) => $m->audit('created', [], $m->auditAttributes($m->getAttributes())));
        static::updated(function ($m) {
            $changed = array_keys($m->getChanges());
            $changed = array_diff($changed, ['updated_at']);
            if ($changed === []) {
                return;
            }
            $m->audit('updated',
                $m->auditAttributes(array_intersect_key($m->getRawOriginal(), array_flip($changed))),
                $m->auditAttributes(array_intersect_key($m->getAttributes(), array_flip($changed))));
        });
        static::deleted(fn ($m) => $m->audit('deleted', $m->auditAttributes($m->getAttributes()), []));
    }

    public function auditEventPrefix(): string
    {
        return Str::snake(class_basename($this));
    }

    protected function audit(string $action, array $before, array $after): void
    {
        app(AuditLogger::class)->log($this->auditEventPrefix().'.'.$action, $this, $before, $after);
    }

    protected function auditAttributes(array $attributes): array
    {
        return array_diff_key($attributes, array_flip(['created_at', 'updated_at', 'password', 'remember_token']));
    }
}
