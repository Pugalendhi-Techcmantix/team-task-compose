<?php

namespace App\Contracts;

use App\Models\Task;

/**
 * Publishes task events for the Node.js realtime service (contract version 1).
 *
 * Implementations must never throw: the database is the source of truth and
 * a messaging outage must not fail an API request.
 */
interface TaskEventPublisher
{
    public const VERSION = 1;

    public const CREATED = 'task.created';

    public const ASSIGNED = 'task.assigned';

    public const UPDATED = 'task.updated';

    public const STATUS_CHANGED = 'task.status_changed';

    public const DELETED = 'task.deleted';

    /** @param  array<string, mixed>  $extra  merged into the payload (e.g. status, previousStatus) */
    public function publish(string $event, Task $task, array $extra = []): void;
}
