<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Usage: ->middleware('mess.role:manager') or 'mess.role:admin,manager'. Must run after `mess`. */
class EnsureMessRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $member = currentMember();
        abort_if($member === null, 404);

        $allowed = collect($roles)->contains(fn ($role) => match ($role) {
            'admin' => $member->isAdmin(),
            'manager' => $member->isManager(),
            default => false,
        });

        abort_unless($allowed, 403, 'Your role cannot do this.');

        return $next($request);
    }
}
