<?php

namespace App\Services\Sms;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/** bulksmsbd.net gateway. Success is HTTP 2xx AND `response_code` 202 in the answer. */
class BulkSmsBdSender implements SmsSender
{
    public const SUCCESS_CODE = 202;

    public function send(string $phone, string $message): void
    {
        $key = config('services.bulksmsbd.api_key');
        $url = config('services.bulksmsbd.url');
        if (! $key || ! $url) {
            throw new SmsFailed('BulkSMSBD is not configured.');
        }

        try {
            // POST: the key travels in the body, never in a URL that could end up in a log.
            $response = Http::asForm()->timeout(10)->post($url, [
                'api_key' => $key,
                'type' => preg_match('/[^\x20-\x7E\n]/', $message) ? 'unicode' : 'text',
                'number' => '88'.$phone,
                'senderid' => config('services.bulksmsbd.sender_id'),
                'message' => $message,
            ]);
        } catch (ConnectionException) {
            throw new SmsFailed('BulkSMSBD could not be reached.');
        }

        $code = $response->json('response_code');
        if ($code === null && is_numeric(trim($response->body()))) {
            $code = trim($response->body());
        }

        if (! $response->successful() || (int) $code !== self::SUCCESS_CODE) {
            throw new SmsFailed("BulkSMSBD rejected the message (HTTP {$response->status()}, response_code ".(is_scalar($code) ? $code : 'none').').');
        }
    }
}
