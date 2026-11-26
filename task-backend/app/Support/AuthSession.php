<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

/** Ends the caller's authentication, whichever way they authenticated. */
final class AuthSession
{
    public static function end(Request $request): void
    {
        $token = $request->user()?->currentAccessToken();

        // Bearer token client: revoke that token.
        if ($token instanceof PersonalAccessToken) {
            $token->delete();

            return;
        }

        // Browser (cookie session): log out and destroy the session + CSRF token.
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }

    /** Id of the Bearer token used for this request, or null for cookie sessions. */
    public static function currentTokenId(Request $request): ?int
    {
        $token = $request->user()?->currentAccessToken();

        return $token instanceof PersonalAccessToken ? (int) $token->id : null;
    }
}
