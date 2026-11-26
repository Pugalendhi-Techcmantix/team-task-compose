<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Every /api request is answered in JSON (even when the client forgets the
 * Accept header), and a malformed JSON body is rejected with 400 instead of
 * silently turning into an empty payload and a misleading 422.
 */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        if ($request->isJson() && $request->getContent() !== '') {
            json_decode($request->getContent());

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'error' => [
                        'code' => 'invalid_json',
                        'message' => 'The request body is not valid JSON.',
                    ],
                ], Response::HTTP_BAD_REQUEST);
            }
        }

        return $next($request);
    }
}
