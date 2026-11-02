<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Picks the language of API messages: the signed-in user's `locale`, else the
 * NEXT_LOCALE cookie, else Accept-Language (bn* → bn), else en.
 * Must run after the session is started so cookie-authenticated SPA users resolve.
 */
class SetLocale
{
    private const SUPPORTED = ['en', 'bn'];

    public function handle(Request $request, Closure $next): Response
    {
        app()->setLocale($this->resolve($request));

        return $next($request);
    }

    private function resolve(Request $request): string
    {
        $user = $request->user('web') ?? $request->user();
        if ($user && in_array($user->locale, self::SUPPORTED, true)) {
            return $user->locale;
        }

        $cookie = $request->cookie('NEXT_LOCALE');
        if (is_string($cookie) && in_array($cookie, self::SUPPORTED, true)) {
            return $cookie;
        }

        $header = strtolower(trim((string) $request->header('Accept-Language', '')));
        if (str_starts_with($header, 'bn')) {
            return 'bn';
        }

        return 'en';
    }
}
