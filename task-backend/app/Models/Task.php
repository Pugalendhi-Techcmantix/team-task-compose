<?php

namespace App\Models;

use App\Contracts\TaskEventPublisher;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Observers\TaskObserver;
use App\Services\TaskNotifier;
use App\Support\TaskChanges;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

#[ObservedBy(TaskObserver::class)]
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory, SoftDeletes;

    /** Columns the API is allowed to sort by. */
    public const SORTABLE = ['created_at', 'updated_at', 'due_date', 'title'];

    /** @var list<string> */
    protected $fillable = [
        'title',
        'description',
        'status',
        'priority',
        'due_date',
        'assigned_to',
    ];

    /** @var array<string, mixed> */
    protected $attributes = [
        'status' => 'todo',
        'priority' => 'medium',
    ];

    /**
     * Status before the last update, captured in "updating" for the task.status_changed event
     * (the after-commit observer runs when the original value is already gone).
     * A declared property, not a column.
     */
    public ?string $previousStatus = null;

    /**
     * The assignee notification created by the last save (inside its transaction), so the
     * after-commit observer can add notificationId + unreadCount to that event.
     * A declared property, not a column.
     *
     * @var array{event: string, id: string, userId: int}|null
     */
    public ?array $pendingNotification = null;

    protected function casts(): array
    {
        return [
            'status' => TaskStatus::class,
            'priority' => TaskPriority::class,
            'due_date' => 'date:Y-m-d',
            'completed_at' => 'datetime',
            'created_by' => 'integer',
            'assigned_to' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        // Keep completed_at in sync with status (also enforced by a DB CHECK constraint).
        static::saving(function (Task $task): void {
            if (! $task->isDirty('status') && $task->exists) {
                return;
            }

            if ($task->status === TaskStatus::Done) {
                $task->completed_at ??= now();
            } else {
                $task->completed_at = null;
            }
        });

        static::updating(function (Task $task): void {
            if ($task->isDirty('status')) {
                $original = $task->getOriginal('status');
                $task->previousStatus = $original instanceof TaskStatus ? $original->value : $original;
            }
        });

        // Notify the assignee in the SAME transaction as the task change (one notification per save).
        static::created(fn (Task $task) => $task->notifyAssignee(TaskEventPublisher::CREATED));
        static::updated(fn (Task $task) => $task->notifyAssignee(TaskChanges::updateEvents($task)[0] ?? null));
    }

    private function notifyAssignee(?string $event): void
    {
        $this->pendingNotification = null;

        if ($event === null) {
            return;
        }

        $notification = app(TaskNotifier::class)->notifyAssignee($this, $event);

        if ($notification) {
            $this->pendingNotification = ['event' => $event, 'id' => $notification->id, 'userId' => (int) $this->assigned_to];
        }
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed(); // keep showing deleted users' names
    }

    /** @return BelongsTo<User, $this> */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to')->withTrashed();
    }

    /**
     * Apply validated list filters (see IndexTaskRequest).
     *
     * @param  Builder<Task>  $query
     * @param  array<string, mixed>  $filters
     */
    public function scopeFilter(Builder $query, array $filters): void
    {
        $query
            ->when($filters['status'] ?? null, fn (Builder $q, string $v) => $q->where('status', $v))
            ->when($filters['priority'] ?? null, fn (Builder $q, string $v) => $q->where('priority', $v))
            ->when($filters['assigned_to'] ?? null, fn (Builder $q, int|string $v) => $q->where('assigned_to', $v))
            ->when($filters['created_by'] ?? null, fn (Builder $q, int|string $v) => $q->where('created_by', $v))
            ->when($filters['due_from'] ?? null, fn (Builder $q, string $v) => $q->whereDate('due_date', '>=', $v))
            ->when($filters['due_to'] ?? null, fn (Builder $q, string $v) => $q->whereDate('due_date', '<=', $v))
            ->when($filters['search'] ?? null, function (Builder $q, string $term): void {
                // Escape LIKE wildcards so "%" or "_" in user input are matched literally.
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $w) => $w
                    ->whereLike('title', $like)
                    ->orWhereLike('description', $like));
            });
    }

    /**
     * Sort by "field" (asc) or "-field" (desc). Value is validated against SORTABLE.
     *
     * @param  Builder<Task>  $query
     */
    public function scopeSortBy(Builder $query, ?string $sort): void
    {
        $sort = $sort ?: '-created_at';
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $column = ltrim($sort, '-');

        $query->orderBy($column, $direction)->orderBy('id', $direction);
    }
}
