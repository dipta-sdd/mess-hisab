<?php

namespace App\Services\Month\Lifecycle;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** A month-lifecycle rule was broken: rendered as 409 {message, code, ...extra}. */
class LifecycleException extends RuntimeException
{
    /** @param array<string,mixed> $extra */
    public function __construct(string $message, public readonly string $errorCode, public readonly array $extra = [])
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'code' => $this->errorCode] + $this->extra, 409);
    }
}
