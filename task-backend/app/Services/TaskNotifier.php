<?php

namespace App\Services;

use App\Contracts\RealtimePublisher;
use App\Contracts\TaskEventPublisher;
use App\Models\Task;
use App\Models\User;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Creates the database notification for a task's assignee (inside the task's
 * transaction) and publishes unread-count changes for the Node.js service.
 *
 * One notification per task save, for the assignee, never for the person who
 * made the change. Its type is the most important change in that save:
 *   task.created > task.assigned > task.status_changed > task.updated
 */
class TaskNotifier
{
    public const COUNT_CHANGED = 'notification.count_changed';

    public function __construct(private readonly RealtimePublisher $realtime) {}

    /** Called from Task::created / Task::updated (still inside the transaction). */
    public function notifyAssignee(Task $task, string $event): ?DatabaseNotification
    {
        $assigneeId = $task->assigned_to;
        $actor = Auth::user();

        if ($assigneeId === null || $assigneeId === $actor?->id) {
            return null;
        }

        $assignee = User::query()->find($assigneeId);
        if (! $assignee || ! $assignee->is_active) {
            return null;
        }

        [$title, $message] = $this->text($event, $task, $actor?->name ?? 'System');

        /** @var DatabaseNotification */
        return $assignee->notifications()->create([
            'id' => (string) Str::uuid(),
            'type' => $event,
            'data' => [
                'type' => $event,
                'title' => $title,
                'message' => $message,
                'task_id' => $task->id,
            ],
        ]);
    }

    public function unreadCount(int $userId): int
    {
        return DatabaseNotification::query()
            ->where('notifiable_type', (new User)->getMorphClass())
            ->where('notifiable_id', $userId)
            ->whereNull('read_at')
            ->count();
    }

    /** After mark-read / mark-all-read: every tab of that user updates its badge. */
    public function publishCount(int $userId): int
    {
        $count = $this->unreadCount($userId);

        $this->realtime->publish(self::COUNT_CHANGED, ['userId' => $userId, 'unreadCount' => $count]);

        return $count;
    }

    /** @return array{0: string, 1: string} */
    private function text(string $event, Task $task, string $actorName): array
    {
        return match ($event) {
            TaskEventPublisher::CREATED, TaskEventPublisher::ASSIGNED => [
                'Task assigned to you',
                "{$actorName} assigned you \"{$task->title}\"",
            ],
            TaskEventPublisher::STATUS_CHANGED => [
                'Task status changed',
                "\"{$task->title}\" is now ".str_replace('_', ' ', $task->status->value),
            ],
            default => [
                'Task updated',
                "{$actorName} updated \"{$task->title}\"",
            ],
        };
    }
}
