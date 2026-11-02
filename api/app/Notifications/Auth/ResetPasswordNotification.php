<?php

namespace App\Notifications\Auth;

use App\Services\Auth\FrontendUrl;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetPasswordNotification extends Notification
{
    public function __construct(public string $token) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function url(object $notifiable): string
    {
        return FrontendUrl::to('reset-password', ['token' => $this->token, 'email' => $notifiable->getEmailForPasswordReset()]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Reset your Mess Hisab password')
            ->line('You are receiving this email because we received a password reset request for your account.')
            ->action('Reset password', $this->url($notifiable))
            ->line('This link expires in '.config('auth.passwords.users.expire').' minutes.')
            ->line('If you did not request a password reset, no further action is required.');
    }
}
