<?php

namespace App\Observers;

use App\Contracts\TaskEventPublisher;
use App\Models\Task;
use App\Services\TaskNotifier;
use App\Support\TaskChanges;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

/**
 * Runs only after the surrounding DB transaction commits, so Node.js is never
 * told about a change that was rolled back.
 *
 * One update can produce several events (TaskChanges::updateEvents). The event that
 * created the assignee's notification (Task::booted) also carries
 * notificationId + unreadCount, so Node can push the badge count.
 */
class TaskObserver implements ShouldHandleEventsAfterCommit
{
    public function __construct(
        private readonly TaskEventPublisher $publisher,
        private readonly TaskNotifier $notifier,
    ) {}

    public function created(Task $task): void
    {
        $this->publish(TaskEventPublisher::CREATED, $task);
    }

    public function updated(Task $task): void
    {
        foreach (TaskChanges::updateEvents($task) as $event) {
            $this->publish($event, $task);
        }
    }

    // No task.deleted: it is not part of the Node.js contract.

    private function publish(string $event, Task $task): void
    {
        $extra = [];
        $pending = $task->pendingNotification;

        if ($pending !== null && $pending['event'] === $event) {
            $extra['notificationId'] = $pending['id'];
            $extra['unreadCount'] = $this->notifier->unreadCount($pending['userId']); // counted after commit
            $task->pendingNotification = null;
        }

        $this->publisher->publish($event, $task, $extra);
    }
}
