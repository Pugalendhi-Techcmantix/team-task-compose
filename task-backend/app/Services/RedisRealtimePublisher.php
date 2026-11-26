<?php

namespace App\Services;

use App\Contracts\RealtimePublisher;
use Illuminate\Redis\RedisManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Redis Pub/Sub on the dedicated "events" connection, which has NO key prefix,
 * so the channel arrives in Redis exactly as REDIS_EVENTS_CHANNEL (taskflow:tasks).
 * (Redis::publish on the default connection would add the "taskflow-database-" prefix.)
 */
class RedisRealtimePublisher implements RealtimePublisher
{
    public function __construct(
        private readonly RedisManager $redis,
        private readonly string $channel,
        private readonly string $connection = 'events',
    ) {}

    public function publish(string $event, array $payload): void
    {
        // Node's contract: exactly these 5 fields; optional payload fields are omitted, never null.
        $message = [
            'eventId' => (string) Str::uuid7(),
            'event' => $event,
            'version' => self::VERSION,
            'payload' => array_filter($payload, fn ($value) => $value !== null),
            'occurredAt' => now()->toIso8601ZuluString(), // 2026-11-26T10:00:00Z
        ];

        // Runs immediately when no transaction is open, otherwise right after COMMIT
        // (never for a rolled-back change).
        DB::afterCommit(fn () => $this->send($message));
    }

    /** @param  array<string, mixed>  $message */
    private function send(array $message): void
    {
        try {
            $this->redis->connection($this->connection)->publish(
                $this->channel,
                json_encode($message, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            );
        } catch (Throwable $e) {
            // Best-effort: the data is already committed; live delivery is degraded, not fatal.
            Log::error('Failed to publish realtime event to Redis', [
                'event' => $message['event'],
                'channel' => $this->channel,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
