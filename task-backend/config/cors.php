<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    // The JSON API and Sanctum's CSRF-cookie endpoint.
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // Comma-separated list, e.g. "http://localhost:8080,http://localhost:5173"
    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:8080'))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With', 'Origin', 'X-XSRF-TOKEN'],

    // Headers the React client is allowed to read from responses.
    'exposed_headers' => ['Location', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],

    // Cache preflight responses for 1 hour.
    'max_age' => (int) env('CORS_MAX_AGE', 3600),

    // Browser login uses the HttpOnly session cookie, so credentialed requests must be allowed.
    'supports_credentials' => true,

];
