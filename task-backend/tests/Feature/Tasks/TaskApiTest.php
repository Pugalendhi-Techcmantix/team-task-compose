<?php

namespace Tests\Feature\Tasks;

use App\Contracts\TaskEventPublisher;
use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------- index

    public function test_index_requires_authentication(): void
    {
        $this->assertApiError($this->getJson('/api/v1/tasks'), 401, 'unauthenticated');
    }

    public function test_index_returns_paginated_tasks_with_meta(): void
    {
        $this->actingAsUser();
        Task::factory()->count(20)->create();

        $this->getJson('/api/v1/tasks?per_page=5')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.total', 20)
            ->assertJsonPath('meta.per_page', 5)
            ->assertJsonPath('meta.last_page', 4)
            ->assertJsonStructure([
                'data' => [['id', 'title', 'description', 'status', 'priority', 'due_date', 'is_overdue',
                    'completed_at', 'created_by', 'assigned_to', 'creator' => ['id', 'name', 'email'],
                    'assignee', 'created_at', 'updated_at']],
                'links' => ['first', 'last', 'prev', 'next'],
                'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            ]);
    }

    public function test_index_filters_by_status_assignee_and_search(): void
    {
        $me = $this->actingAsUser();
        Task::factory()->status(TaskStatus::Done)->create(['title' => 'Ship the release']);
        Task::factory()->status(TaskStatus::Todo)->assignedTo($me)->create(['title' => 'Write 100% coverage notes']);
        Task::factory()->status(TaskStatus::Todo)->create(['title' => 'Something else']);

        $this->getJson('/api/v1/tasks?status=done')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Ship the release');

        $this->getJson("/api/v1/tasks?assigned_to={$me->id}")
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.assignee.id', $me->id);

        // Case-insensitive, and "%" is matched literally (not as a wildcard).
        $this->getJson('/api/v1/tasks?search='.urlencode('100%'))
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Write 100% coverage notes');
        $this->getJson('/api/v1/tasks?search=SHIP')->assertJsonCount(1, 'data');
    }

    public function test_index_sorts_by_allowed_field(): void
    {
        $this->actingAsUser();
        Task::factory()->create(['title' => 'Bravo']);
        Task::factory()->create(['title' => 'Alpha']);

        $this->getJson('/api/v1/tasks?sort=title')->assertJsonPath('data.0.title', 'Alpha');
        $this->getJson('/api/v1/tasks?sort=-title')->assertJsonPath('data.0.title', 'Bravo');
    }

    public function test_index_rejects_invalid_query_parameters(): void
    {
        $this->actingAsUser();

        $this->getJson('/api/v1/tasks?sort=password&per_page=1000&status=archived&due_from=2026-13-01')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_error')
            ->assertJsonValidationErrors(['sort', 'per_page', 'status', 'due_from'], 'error.details');
    }

    // ---------------------------------------------------------------- store

    public function test_store_creates_task_and_returns_201_with_location(): void
    {
        $me = $this->actingAsUser();
        $assignee = User::factory()->create();

        $response = $this->postJson('/api/v1/tasks', [
            'title' => 'Build the dashboard',
            'description' => 'List + filters',
            'priority' => 'high',
            'due_date' => now()->addDays(3)->toDateString(),
            'assigned_to' => $assignee->id,
        ]);

        $id = $response->json('data.id');

        $response->assertCreated()
            ->assertHeader('Location', route('tasks.show', $id))
            ->assertJsonPath('message', 'Task created successfully.')
            ->assertJsonPath('data.status', 'todo')         // default
            ->assertJsonPath('data.priority', 'high')
            ->assertJsonPath('data.created_by', $me->id)
            ->assertJsonPath('data.assignee.id', $assignee->id);

        $this->assertDatabaseHas('tasks', ['id' => $id, 'created_by' => $me->id, 'status' => 'todo']);
        $this->events->assertPublished(TaskEventPublisher::CREATED, $id);
    }

    public function test_store_ignores_attempt_to_spoof_creator(): void
    {
        $me = $this->actingAsUser();
        $other = User::factory()->create();

        $this->postJson('/api/v1/tasks', ['title' => 'Spoof', 'created_by' => $other->id])
            ->assertCreated()
            ->assertJsonPath('data.created_by', $me->id);
    }

    public function test_store_validates_every_field(): void
    {
        $this->actingAsUser();

        $this->postJson('/api/v1/tasks', [
            'title' => 'ab',
            'description' => str_repeat('x', 5001),
            'status' => 'archived',
            'priority' => 'critical',
            'due_date' => now()->subDay()->toDateString(),
            'assigned_to' => 999999,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(
                ['title', 'description', 'status', 'priority', 'due_date', 'assigned_to'],
                'error.details',
            );

        $this->postJson('/api/v1/tasks', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['title'], 'error.details');

        $this->events->assertNothingPublished();
    }

    public function test_store_with_status_done_sets_completed_at(): void
    {
        $this->actingAsUser();

        $this->postJson('/api/v1/tasks', ['title' => 'Already done', 'status' => 'done'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'done')
            ->assertJsonPath('data.completed_at', fn ($v) => $v !== null);
    }

    // ---------------------------------------------------------------- show

    public function test_show_returns_task(): void
    {
        $this->actingAsUser();
        $task = Task::factory()->create();

        $this->getJson("/api/v1/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $task->id)
            ->assertJsonPath('data.title', $task->title);
    }

    public function test_show_missing_or_deleted_task_returns_404(): void
    {
        $this->actingAsUser();
        $task = Task::factory()->create();
        $task->delete();

        $this->assertApiError($this->getJson('/api/v1/tasks/999999'), 404, 'not_found');
        $this->getJson("/api/v1/tasks/{$task->id}")
            ->assertNotFound()
            ->assertJsonPath('error.message', 'Task not found.');
    }

    // ---------------------------------------------------------------- update

    public function test_update_applies_partial_changes(): void
    {
        $me = $this->actingAsUser();
        $task = Task::factory()->createdBy($me)->status(TaskStatus::Todo)->create(['title' => 'Old title', 'priority' => 'low']);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['title' => 'New title'])
            ->assertOk()
            ->assertJsonPath('message', 'Task updated successfully.')
            ->assertJsonPath('data.title', 'New title')
            ->assertJsonPath('data.priority', 'low'); // untouched

        $this->events->assertPublished(TaskEventPublisher::UPDATED, $task->id);
    }

    public function test_moving_status_to_done_and_back_tracks_completed_at(): void
    {
        $me = $this->actingAsUser();
        $task = Task::factory()->createdBy($me)->status(TaskStatus::Todo)->create();

        $this->putJson("/api/v1/tasks/{$task->id}", ['status' => 'done'])
            ->assertOk()->assertJsonPath('data.completed_at', fn ($v) => $v !== null);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['status' => 'in_progress'])
            ->assertOk()->assertJsonPath('data.completed_at', null);
    }

    public function test_update_can_keep_an_existing_past_due_date(): void
    {
        $me = $this->actingAsUser();
        $past = now()->subWeek()->toDateString();
        $task = Task::factory()->createdBy($me)->status(TaskStatus::Todo)->create(['due_date' => $past]);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['due_date' => $past, 'title' => 'Still late'])
            ->assertOk()
            ->assertJsonPath('data.is_overdue', true);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['due_date' => now()->subDays(2)->toDateString()])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['due_date'], 'error.details');
    }

    public function test_update_rejects_empty_body_and_null_title(): void
    {
        $me = $this->actingAsUser();
        $task = Task::factory()->createdBy($me)->create();

        $this->patchJson("/api/v1/tasks/{$task->id}", [])
            ->assertStatus(422)->assertJsonValidationErrors(['body'], 'error.details');

        $this->patchJson("/api/v1/tasks/{$task->id}", ['title' => null])
            ->assertStatus(422)->assertJsonValidationErrors(['title'], 'error.details');
    }

    public function test_assignee_can_be_cleared(): void
    {
        $me = $this->actingAsUser();
        $task = Task::factory()->createdBy($me)->assignedTo(User::factory()->create())->create();

        $this->patchJson("/api/v1/tasks/{$task->id}", ['assigned_to' => null])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', null)
            ->assertJsonPath('data.assignee', null);
    }

    // ---------------------------------------------------------------- destroy

    public function test_creator_can_delete_task_softly(): void
    {
        $me = $this->actingAsUser();
        $task = Task::factory()->createdBy($me)->create();

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertNoContent();

        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
        $this->assertNotContains('task.deleted', $this->events->events()); // not part of the Node contract
    }

    public function test_admin_can_delete_any_task(): void
    {
        $this->actingAsUser(User::factory()->superAdmin()->create());
        $task = Task::factory()->create();

        $this->deleteJson("/api/v1/tasks/{$task->id}")->assertNoContent();
    }

    // ---------------------------------------------------------------- users

    public function test_users_endpoint_lists_team_members_without_secrets(): void
    {
        $this->actingAsUser();
        User::factory()->count(2)->create();

        $this->getJson('/api/v1/users')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonMissingPath('data.0.password')
            ->assertJsonStructure(['data' => [['id', 'name', 'email', 'is_active', 'role' => ['id', 'name', 'slug']]], 'meta']);
    }
}
