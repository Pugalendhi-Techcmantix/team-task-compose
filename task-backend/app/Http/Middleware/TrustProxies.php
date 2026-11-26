<?php

namespace App\Http\Middleware;

use Illuminate\Http\Middleware\TrustProxies as Middleware;

/**
 * Trusts X-Forwarded-* headers only from the proxies listed in
 * config('app.trusted_proxies') — e.g. the Nginx gateway on the Docker network —
 * so request()->ip() (used for login throttling) is the real client IP.
 *
 * Read at request time (not in bootstrap/app.php) so it works with .env and config:cache.
 */
class TrustProxies extends Middleware
{
    protected function proxies()
    {
        return config('app.trusted_proxies');
    }
}
