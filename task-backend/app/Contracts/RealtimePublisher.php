<?php

namespace App\Contracts;

/**
 * Publishes one event for the Node.js realtime service (contract version 1):
 * { eventId, event, version, payload, occurredAt } on REDIS_EVENTS_CHANNEL
 * (task-node/README.md "Redis event contract"). Null payload values are omitted.
 *
 * Implementations publish only after the surrounding DB transaction commits
 * and never throw (the database is the source of truth).
 */
interface RealtimePublisher
{
    public const VERSION = 1;

    /** @param  array<string, mixed>  $payload */
    public function publish(string $event, array $payload): void;
}
