<?php

namespace App\Support;

use App\Contracts\TaskEventPublisher;
use App\Models\Task;

/**
 * Which realtime events one task save produces — shared by the in-transaction
 * notification hook and the after-commit observer, so they always agree.
 */
final class TaskChanges
{
    /** Columns that change as a side effect and are not "user edits" on their own. */
    private const IGNORED = ['updated_at', 'completed_at'];

    /**
     * Events for an update, in publish order: assigned → status_changed → updated.
     *
     * @return list<string>
     */
    public static function updateEvents(Task $task): array
    {
        $changed = array_values(array_diff(array_keys($task->getChanges()), self::IGNORED));
        if ($changed === []) {
            return [];
        }

        $events = [];
        $assigneeChanged = in_array('assigned_to', $changed, true);

        if ($assigneeChanged && $task->assigned_to !== null) {
            $events[] = TaskEventPublisher::ASSIGNED;
        }
        if (in_array('status', $changed, true)) {
            $events[] = TaskEventPublisher::STATUS_CHANGED;
        }
        if (array_diff($changed, ['status', 'assigned_to']) !== [] || ($assigneeChanged && $task->assigned_to === null)) {
            $events[] = TaskEventPublisher::UPDATED;
        }

        return $events;
    }
}
