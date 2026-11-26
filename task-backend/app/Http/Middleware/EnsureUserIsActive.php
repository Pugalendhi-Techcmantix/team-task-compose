<?php

namespace App\Http\Middleware;

use App\Support\AuthSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** A deactivated account is locked out immediately, even with a still-valid token. */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->is_active) {
            AuthSession::end($request); // revoke the token or destroy the session

            return response()->json([
                'error' => [
                    'code' => 'account_inactive',
                    'message' => 'Your account has been deactivated. Contact an administrator.',
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
