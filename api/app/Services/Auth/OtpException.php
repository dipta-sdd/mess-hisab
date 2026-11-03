<?php

namespace App\Services\Auth;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** A phone-code problem with a machine `code` the web app switches on. */
class OtpException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        public readonly int $status,
        public readonly ?string $field = 'code',
        public readonly array $extra = [],
    ) {
        parent::__construct(__("otp.{$errorCode}", $extra));
    }

    public static function invalid(): self
    {
        return new self('otp_invalid', 422);
    }

    public static function expired(): self
    {
        return new self('otp_expired', 422);
    }

    public static function tooMany(): self
    {
        return new self('otp_too_many', 422);
    }

    public static function resendWait(int $retryAfter): self
    {
        return new self('otp_resend_wait', 429, null, ['retry_after' => $retryAfter, 'seconds' => $retryAfter]);
    }

    public static function smsFailed(): self
    {
        return new self('sms_failed', 503, null);
    }

    public function render(): JsonResponse
    {
        $body = ['message' => $this->getMessage(), 'code' => $this->errorCode];
        if (isset($this->extra['retry_after'])) {
            $body['retry_after'] = $this->extra['retry_after'];
        }
        if ($this->field) {
            $body['errors'] = [$this->field => [$this->getMessage()]];
        }

        return response()->json($body, $this->status);
    }
}
