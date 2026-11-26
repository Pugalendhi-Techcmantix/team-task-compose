<?php

namespace Tests\Feature\Notifications;

use App\Contracts\TaskEventPublisher;
use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    private User $assignee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actor = User::factory()->create(['name' => 'Priya']);
        $this->assignee = User::factory()->create(['name' => 'Arun']);
    }

    /** @return array<string, mixed> */
    private function eventFor(string $event): array
    {
        $found = collect($this->events->published)->firstWhere('event', $event);
        $this->assertNotNull($found, "No {$event} published: ".json_encode($this->events->published));

        return $found;
    }

    // ---------------------------------------------------------------- creating notifications

    public function test_assigning_a_task_notifies_the_assignee_and_event_carries_id_and_count(): void
    {
        $this->actingAsUser($this->actor);
        $task = Task::factory()->createdBy($this->actor)->create(['title' => 'Fix payment bug', 'assigned_to' => null]);
        $this->events->reset();

        $this->patchJson("/api/v1/tasks/{$task->id}", ['assigned_to' => $this->assignee->id])->assertOk();

        $notification = $this->assignee->notifications()->sole();
        $this->assertSame('task.assigned', $notification->type);
        $this->assertEquals( // jsonb doesn't keep key order, so compare contents
            ['type' => 'task.assigned', 'title' => 'Task assigned to you', 'message' => 'Priya assigned you "Fix payment bug"', 'task_id' => $task->id],
            $notification->data,
        );

        $event = $this->eventFor(TaskEventPublisher::ASSIGNED);
        $this->assertSame($notification->id, $event['extra']['notificationId']);
        $this->assertTrue(Str::isUuid($event['extra']['notificationId']));
        $this->assertSame(1, $event['extra']['unreadCount']); // integer, counted after commit
    }

    public function test_one_notification_per_save_attached_to_the_most_important_event(): void
    {
        $this->actingAsUser($this->actor);
        $task = Task::factory()->createdBy($this->actor)->status(TaskStatus::Todo)->create(['assigned_to' => null, 'priority' => 'low']);
        $this->events->reset();

        $this->patchJson("/api/v1/tasks/{$task->id}", ['assigned_to' => $this->assignee->id, 'status' => 'in_progress', 'priority' => 'high'])->assertOk();

        $this->assertSame(1, $this->assignee->notifications()->count());
        $this->assertArrayHasKey('notificationId', $this->eventFor(TaskEventPublisher::ASSIGNED)['extra']);
        $this->assertArrayNotHasKey('notificationId', $this->eventFor(TaskEventPublisher::STATUS_CHANGED)['extra']);
        $this->assertArrayNotHasKey('notificationId', $this->eventFor(TaskEventPublisher::UPDATED)['extra']);
    }

    public function test_creating_an_assigned_task_and_status_change_notify_the_assignee(): void
    {
        $this->actingAsUser($this->actor);

        $id = $this->postJson('/api/v1/tasks', ['title' => 'New one', 'assigned_to' => $this->assignee->id])->assertCreated()->json('data.id');
        $this->assertSame(1, $this->eventFor(TaskEventPublisher::CREATED)['extra']['unreadCount']);

        $this->patchJson("/api/v1/tasks/{$id}", ['status' => 'done'])->assertOk();
        $latest = $this->assignee->notifications()->first();
        $this->assertSame('task.status_changed', $latest->type);
        $this->assertSame('"New one" is now done', $latest->data['message']);
        $this->assertSame(2, $this->eventFor(TaskEventPublisher::STATUS_CHANGED)['extra']['unreadCount']);
    }

    public function test_no_notification_for_your_own_changes_or_unassigned_tasks(): void
    {
        $this->actingAsUser($this->assignee);
        $task = Task::factory()->createdBy($this->assignee)->create(['assigned_to' => null]);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['assigned_to' => $this->assignee->id])->assertOk(); // self-assign
        $this->postJson('/api/v1/tasks', ['title' => 'Nobody assigned'])->assertCreated();

        $this->assertSame(0, $this->assignee->notifications()->count());
        $this->assertArrayNotHasKey('notificationId', $this->eventFor(TaskEventPublisher::ASSIGNED)['extra']);
    }

    // ---------------------------------------------------------------- REST

    public function test_list_unread_count_mark_read_and_read_all(): void
    {
        $this->actingAsUser($this->actor);
        $tasks = Task::factory()->count(3)->createdBy($this->actor)->create(['assigned_to' => null]);
        foreach ($tasks as $t) {
            $this->patchJson("/api/v1/tasks/{$t->id}", ['assigned_to' => $this->assignee->id])->assertOk();
        }

        $this->actingAsUser($this->assignee);

        $list = $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.unread_count', 3)
            ->assertJsonPath('data.0.read_at', null)
            ->assertJsonStructure(['data' => [['id', 'type', 'data' => ['type', 'title', 'message', 'task_id'], 'read_at', 'created_at']], 'meta' => ['total']]);
        $this->getJson('/api/v1/notifications/unread-count')->assertExactJson(['data' => ['unread_count' => 3, 'count' => 3]]);

        // Mark one read → count 2, pushed to every tab.
        $id = $list->json('data.0.id');
        $this->postJson("/api/v1/notifications/{$id}/read")
            ->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.unread_count', 2)
            ->assertJsonPath('data.read_at', fn ($v) => $v !== null);
        $this->realtime->assertPublished('notification.count_changed', ['userId' => $this->assignee->id, 'unreadCount' => 2]);

        // Idempotent: reading it again publishes nothing new.
        $published = count($this->realtime->published);
        $this->postJson("/api/v1/notifications/{$id}/read")->assertOk()->assertJsonPath('data.unread_count', 2);
        $this->assertCount($published, $this->realtime->published);

        $this->getJson('/api/v1/notifications?unread=1')->assertJsonCount(2, 'data');

        $this->postJson('/api/v1/notifications/read-all')->assertExactJson(['data' => ['updated' => 2, 'unread_count' => 0]]);
        $this->realtime->assertPublished('notification.count_changed', ['userId' => $this->assignee->id, 'unreadCount' => 0]);
        $this->getJson('/api/v1/notifications/unread-count')->assertExactJson(['data' => ['unread_count' => 0, 'count' => 0]]);
    }

    public function test_cannot_read_someone_elses_notification(): void
    {
        $this->actingAsUser($this->actor);
        $task = Task::factory()->createdBy($this->actor)->create(['assigned_to' => null]);
        $this->patchJson("/api/v1/tasks/{$task->id}", ['assigned_to' => $this->assignee->id])->assertOk();
        $id = $this->assignee->notifications()->sole()->id;

        $this->actingAsUser(User::factory()->create());
        $this->assertApiError($this->postJson("/api/v1/notifications/{$id}/read"), 404, 'not_found');
        $this->assertApiError($this->postJson('/api/v1/notifications/not-a-uuid/read'), 404, 'not_found');
        $this->assertNull($this->assignee->notifications()->sole()->read_at);
    }

    public function test_notifications_require_login(): void
    {
        $this->assertApiError($this->getJson('/api/v1/notifications/unread-count'), 401, 'unauthenticated');
    }
}
