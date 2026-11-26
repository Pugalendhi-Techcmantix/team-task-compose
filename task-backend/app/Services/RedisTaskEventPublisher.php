<?php

namespace App\Services;

use App\Contracts\RealtimePublisher;
use App\Contracts\TaskEventPublisher;
use App\Models\Task;
use Illuminate\Support\Facades\Auth;

/**
 * Task payloads exactly as the Node.js contract defines them (IDs are positive
 * integers; optional fields are left out when empty, never sent as null):
 *
 *   task.created        { taskId, title, createdBy, assignedTo? }
 *   task.assigned       { taskId, assignedTo, title, createdBy, assignedBy? }
 *   task.updated        { taskId, title, assignedTo?, updatedBy? }
 *   task.status_changed { taskId, status, previousStatus?, title, assignedTo?, changedBy? }
 *
 * The event that stored the assignee's notification also gets
 * notificationId (UUID) + unreadCount (including this one).
 */
class RedisTaskEventPublisher implements TaskEventPublisher
{
    public function __construct(private readonly RealtimePublisher $realtime) {}

    public function publish(string $event, Task $task, array $extra = []): void
    {
        $actorId = Auth::id();

        $payload = match ($event) {
            self::CREATED => [
                'taskId' => $task->id,
                'title' => $task->title,
                'createdBy' => $task->created_by,
                'assignedTo' => $task->assigned_to,
            ],
            self::ASSIGNED => [
                'taskId' => $task->id,
                'assignedTo' => $task->assigned_to,
                'title' => $task->title,
                'createdBy' => $task->created_by,
                'assignedBy' => $actorId,
            ],
            self::STATUS_CHANGED => [
                'taskId' => $task->id,
                'status' => $task->status->value,
                'previousStatus' => $task->previousStatus,
                'title' => $task->title,
                'assignedTo' => $task->assigned_to,
                'changedBy' => $actorId,
            ],
            default => [ // task.updated
                'taskId' => $task->id,
                'title' => $task->title,
                'assignedTo' => $task->assigned_to,
                'updatedBy' => $actorId,
            ],
        };

        $this->realtime->publish($event, [...$payload, ...$extra]);
    }
}
