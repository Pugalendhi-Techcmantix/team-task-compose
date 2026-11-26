<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

/**
 * Two login modes, chosen automatically:
 *
 *  - Browser SPA (request from SANCTUM_STATEFUL_DOMAINS, so a session exists):
 *    the user is logged in with an HttpOnly, encrypted session cookie. No token
 *    is ever returned, so JavaScript can't read or leak it.
 *  - Other clients (Postman, curl, Node.js, mobile): a Bearer token is returned.
 */
class AuthController extends Controller
{
    /** POST /api/v1/auth/login */
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        $user = User::query()->with('role')->where('email', $credentials['email'])->first();

        // Same response (and similar timing) for "unknown email" and "wrong password":
        // never reveal which emails exist.
        $passwordOk = Hash::check($credentials['password'], $user?->password ?? self::dummyHash());

        if (! $user || ! $passwordOk) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_credentials',
                    'message' => 'The email or password is incorrect.',
                ],
            ], Response::HTTP_UNAUTHORIZED);
        }

        // Only after a correct password, so this can't be used to probe accounts.
        if (! $user->is_active) {
            return response()->json([
                'error' => [
                    'code' => 'account_inactive',
                    'message' => 'Your account has been deactivated. Contact an administrator.',
                ],
            ], Response::HTTP_FORBIDDEN);
        }

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate(); // new session id: prevents session fixation

            return response()->json([
                'message' => 'Login successful.',
                'data' => [
                    'auth' => 'session',
                    'user' => UserResource::withPermissions($user)->resolve(),
                ],
            ]);
        }

        $deviceName = $credentials['device_name'] ?? 'api';
        $minutes = config('sanctum.expiration');
        $expiresAt = $minutes ? now()->addMinutes($minutes) : null;

        // One active token per device: logging in again from the same client replaces the old token.
        $user->tokens()->where('name', $deviceName)->delete();
        $token = $user->createToken($deviceName, ['*'], $expiresAt);

        return response()->json([
            'message' => 'Login successful.',
            'data' => [
                'auth' => 'token',
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt?->toIso8601String(),
                'user' => UserResource::withPermissions($user)->resolve(),
            ],
        ]);
    }

    /** GET /api/v1/auth/me — current user with role + effective permissions (Node.js uses it to verify sockets). */
    public function me(Request $request): UserResource
    {
        return UserResource::withPermissions($request->user());
    }

    /** POST /api/v1/auth/logout — ends the browser session, or revokes the Bearer token used. */
    public function logout(Request $request): Response
    {
        AuthSession::end($request);

        return response()->noContent();
    }

    /** A real bcrypt hash to compare against when the email is unknown. */
    private static function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make('dummy-password-for-timing');
    }
}
