<?php

use App\Exceptions\ApiExceptionRenderer;
use App\Http\Middleware\EnsureServiceToken;
use App\Http\Middleware\EnsureUserIsActive;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\TrustProxies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\TrustProxies as BaseTrustProxies;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind the Nginx gateway: trust forwarded headers only from config('app.trusted_proxies').
        $middleware->replace(BaseTrustProxies::class, TrustProxies::class);

        $middleware->api(prepend: [ForceJsonResponse::class]);
        $middleware->throttleApi();
        // Requests from SANCTUM_STATEFUL_DOMAINS get session + encrypted HttpOnly cookie + CSRF protection.
        $middleware->statefulApi();
        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'service.token' => EnsureServiceToken::class,
        ]);

        // An API has no login page: unauthenticated API calls get a 401 JSON, never a redirect.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        $exceptions->render(new ApiExceptionRenderer);
    })->create();
