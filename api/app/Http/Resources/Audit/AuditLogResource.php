<?php

namespace App\Http\Resources\Audit;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\AuditLog */
class AuditLogResource extends JsonResource
{
    /** Keys whose values must never reach a client (matched case-insensitively). */
    private const SECRET_KEY = '/password|remember_token|(^|_)token$|secret|api_key|^authorization$/i';

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'event' => $this->event,
            'member_id' => $this->member_id,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'before' => $this->scrub($this->before),
            'after' => $this->scrub($this->after),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /** Empty snapshots serialise as {} (never []); secret values are replaced. */
    private function scrub(?array $data): object|array
    {
        if (! $data) {
            return (object) [];
        }

        return $this->redact($data);
    }

    private function redact(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_string($key) && preg_match(self::SECRET_KEY, $key)) {
                $data[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $data[$key] = $this->redact($value);
            }
        }

        return $data;
    }
}
