<?php

namespace App\Services\Sms;

interface SmsSender
{
    /**
     * Send a text to a Bangladesh mobile in local form (`01XXXXXXXXX`).
     *
     * @throws SmsFailed when the gateway did not accept the message
     */
    public function send(string $phone, string $message): void;
}
