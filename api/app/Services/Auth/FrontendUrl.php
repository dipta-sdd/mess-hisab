<?php

namespace App\Services\Auth;

/** Builds absolute links into the Next.js app (FRONTEND_URL). */
class FrontendUrl
{
    public static function base(): string
    {
        $base = config('app.frontend_url') ?: env('FRONTEND_URL', 'http://localhost:3000');

        return rtrim((string) $base, '/');
    }

    public static function to(string $path = '', array $query = []): string
    {
        $url = self::base().'/'.ltrim($path, '/');

        return $query === [] ? $url : $url.'?'.http_build_query($query);
    }
}
