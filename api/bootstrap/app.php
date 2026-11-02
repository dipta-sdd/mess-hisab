<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->api(append: \App\Http\Middleware\SetLocale::class);
        $middleware->encryptCookies(except: ['NEXT_LOCALE']); // set by the web app, read in SetLocale
        $middleware->alias([
            'mess' => \App\Http\Middleware\ResolveMess::class,
            'mess.role' => \App\Http\Middleware\EnsureMessRole::class,
        ]);
        // Resolve the mess before route-model binding so bound child models are mess-scoped.
        $middleware->prependToPriorityList(
            before: \Illuminate\Routing\Middleware\SubstituteBindings::class,
            prepend: \App\Http\Middleware\ResolveMess::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
