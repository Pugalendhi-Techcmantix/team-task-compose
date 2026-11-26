<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards /api/v1/internal/* (service-to-service calls from the Node.js realtime service).
 * The caller must send "Authorization: Bearer <INTERNAL_SERVICE_TOKEN>".
 * Constant-time comparison (hash_equals) so the token can't be guessed by timing.
 */
class EnsureServiceToken
{
    private const MIN_LENGTH = 32;

    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.realtime.service_token');
        $given = (string) $request->bearerToken();

        // A missing or too-short configured token disables the internal API instead of accepting anything.
        if (strlen($expected) < self::MIN_LENGTH || $given === '' || ! hash_equals($expected, $given)) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_service_token',
                    'message' => 'A valid service token is required for internal endpoints.',
                ],
            ], Response::HTTP_UNAUTHORIZED);
        }

        return $next($request);
    }
}
