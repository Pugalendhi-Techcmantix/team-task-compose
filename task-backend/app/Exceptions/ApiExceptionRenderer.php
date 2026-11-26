<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Converts any exception thrown under /api into the single error envelope:
 *
 * { "error": { "code": "not_found", "message": "Task not found.", "details": {...}? } }
 */
class ApiExceptionRenderer
{
    /** Machine-readable codes for HTTP statuses the API can return. */
    private const CODES = [
        400 => 'bad_request',
        401 => 'unauthenticated',
        403 => 'forbidden',
        404 => 'not_found',
        405 => 'method_not_allowed',
        409 => 'conflict',
        413 => 'payload_too_large',
        415 => 'unsupported_media_type',
        419 => 'csrf_token_mismatch', // browser: call GET /sanctum/csrf-cookie and retry
        422 => 'validation_error',
        429 => 'too_many_requests',
        503 => 'service_unavailable',
    ];

    public function __invoke(Throwable $e, Request $request): ?JsonResponse
    {
        if (! $request->is('api/*')) {
            return null; // let Laravel handle non-API routes normally
        }

        return match (true) {
            $e instanceof ValidationException => $this->respond(
                422,
                'validation_error',
                'The given data was invalid.',
                $e->errors(),
            ),

            $e instanceof AuthenticationException => $this->respond(
                401,
                'unauthenticated',
                'Authentication is required. Please log in.',
            ),

            $e instanceof HttpExceptionInterface => $this->fromHttpException($e),

            default => $this->serverError($e),
        };
    }

    private function fromHttpException(HttpExceptionInterface $e): JsonResponse
    {
        $status = $e->getStatusCode();
        $previous = $e instanceof Throwable ? $e->getPrevious() : null;

        $message = match (true) {
            // Laravel wraps ModelNotFoundException in a NotFoundHttpException.
            $previous instanceof ModelNotFoundException => class_basename($previous->getModel()).' not found.',
            $status === 404 => 'The requested resource was not found.',
            $status === 403 => ($e->getMessage() !== '' ? $e->getMessage() : 'You are not allowed to perform this action.'),
            $status === 405 => 'This HTTP method is not supported for this endpoint.',
            $status === 429 => 'Too many requests. Please slow down and retry later.',
            default => $e->getMessage() !== '' ? $e->getMessage() : 'Request could not be processed.',
        };

        return $this->respond(
            $status,
            self::CODES[$status] ?? ($status >= 500 ? 'server_error' : 'http_error'),
            $message,
            headers: $e->getHeaders(),
        );
    }

    private function serverError(Throwable $e): JsonResponse
    {
        $debug = config('app.debug')
            ? ['exception' => $e::class, 'message' => $e->getMessage(), 'file' => $e->getFile().':'.$e->getLine()]
            : null;

        // Never leak SQL, stack traces or internals in production.
        return $this->respond(500, 'server_error', 'An unexpected error occurred.', debug: $debug);
    }

    /**
     * @param  array<string, mixed>|null  $details
     * @param  array<string, string>  $headers
     * @param  array<string, mixed>|null  $debug
     */
    private function respond(
        int $status,
        string $code,
        string $message,
        ?array $details = null,
        array $headers = [],
        ?array $debug = null,
    ): JsonResponse {
        $error = ['code' => $code, 'message' => $message];

        if ($details !== null) {
            $error['details'] = $details;
        }

        if ($debug !== null) {
            $error['debug'] = $debug;
        }

        return response()->json(['error' => $error], $status, $headers);
    }
}
