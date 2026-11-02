<?php

namespace App\Services\Report;

use RuntimeException;

/** A report that cannot be built yet; rendered as 409 {code, message, ...extra}. */
class ReportException extends RuntimeException
{
    /** @param array<string,mixed> $extra */
    public function __construct(string $message, public readonly string $errorCode, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}
