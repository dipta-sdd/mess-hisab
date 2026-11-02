<?php

namespace App\Services\Setup;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** A domain rule of the monthly setup was broken: rendered as 409 {message, code}. */
class SetupException extends RuntimeException
{
    public function __construct(string $message, public readonly string $errorCode)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'code' => $this->errorCode], 409);
    }
}
