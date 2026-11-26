<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Firebase\JWT\JWT;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

/**
 * POST /api/v1/realtime/token — a short-lived JWT the browser hands to Socket.IO,
 * so the Node.js service can identify the user without seeing the session cookie.
 * Works for both cookie (SPA) and Bearer-token logins.
 */
class RealtimeTokenController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $config = config('services.realtime');
        $secret = (string) ($config['secret'] ?? '');

        if (strlen($secret) < 32) {
            throw new ServiceUnavailableHttpException(null, 'Realtime service is not configured.');
        }

        $now = time();
        $expiresAt = $now + (int) $config['token_ttl'];

        $token = JWT::encode([
            'sub' => (string) $request->user()->id,
            'iss' => $config['issuer'],
            'aud' => $config['audience'],
            'iat' => $now,
            'exp' => $expiresAt,
        ], $secret, 'HS256');

        return response()->json([
            'data' => [
                'token' => $token,
                'expires_at' => date(DATE_ATOM, $expiresAt),
            ],
        ]);
    }
}
