<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Node.js real-time service.
    'realtime' => [
        // Redis Pub/Sub channel for task events.
        'channel' => env('REDIS_EVENTS_CHANNEL', 'taskflow:tasks'),
        // HS256 key for the short-lived socket JWT (shared with Node, min 32 chars).
        'secret' => env('REALTIME_TOKEN_SECRET'),
        'token_ttl' => (int) env('REALTIME_TOKEN_TTL', 900), // seconds
        'issuer' => 'taskflow',
        'audience' => 'realtime-service',
        // Bearer token Node sends to /api/v1/internal/* (min 32 chars). Node calls it LARAVEL_SERVICE_TOKEN.
        'service_token' => env('INTERNAL_SERVICE_TOKEN'),
    ],

];
