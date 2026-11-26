<?php

namespace Tests\Feature\Tasks;

use App\Contracts\TaskEventPublisher;
use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use App\Services\RedisRealtimePublisher;
use App\Services\RedisTaskEventPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Redis\Connections\Connection;
use Illuminate\Redis\RedisManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class TaskEventPublishingTest extends TestCase
{
    use RefreshDatabase;

    public function test_publishes_v1_contract_to_configured_channel(): void
    {
        $assignee = User::factory()->create();
        /** @var array<string, mixed> $captured  filled by the mock below (by reference) */
        $captured = [];
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('publish')->once()->withArgs(function (string $channel, string $json) use (&$captured) {
            $captured = json_decode($json, true);

            return $channel === 'taskflow:tasks';
        });

        $this->useRealPublisherWith($connection);
        $me = $this->actingAsUser();

        $id = $this->postJson('/api/v1/tasks', ['title' => 'Fix payment bug', 'assigned_to' => $assignee->id])
            ->assertCreated()->json('data.id');

        $this->assertSame(['eventId', 'event', 'version', 'payload', 'occurredAt'], array_keys($captured)); // exactly 5 fields
        $this->assertTrue(Str::isUuid($captured['eventId']));
        $this->assertSame('task.created', $captured['event']);
        $this->assertSame(1, $captured['version']);
        // Assigned at creation → the assignee was notified, so the event carries the notification id + unread count.
        $notificationId = $assignee->notifications()->sole()->id;
        $this->assertSame([
            'taskId' => $id, 'title' => 'Fix payment bug', 'createdBy' => $me->id, 'assignedTo' => $assignee->id,
            'notificationId' => $notificationId, 'unreadCount' => 1,
        ], $captured['payload']);
        $this->assertNotFalse(\DateTimeImmutable::createFromFormat(DATE_ATOM, $captured['occurredAt']));
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/', $captured['occurredAt']); // UTC, "Z" form
    }

    public function test_status_change_event_carries_status_and_previous_status(): void
    {
        $captured = [];
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('publish')->withArgs(function (string $channel, string $json) use (&$captured) {
            $captured[] = json_decode($json, true);

            return $channel === 'taskflow:tasks';
        });

        $me = $this->actingAsUser();
        $task = Task::factory()->createdBy($me)->status(TaskStatus::Todo)->create();
        $this->useRealPublisherWith($connection);

        $this->patchJson("/api/v1/tasks/{$task->id}", ['status' => 'in_progress'])->assertOk();

        $this->assertCount(1, $captured);
        $this->assertSame('task.status_changed', $captured[0]['event']);
        $this->assertSame('in_progress', $captured[0]['payload']['status']);
        $this->assertSame('todo', $captured[0]['payload']['previousStatus']);
    }

    public function test_update_emits_the_right_events_for_each_kind_of_change(): void
    {
        $me = $this->actingAsUser();
        $other = User::factory()->create();
        $task = Task::factory()->createdBy($me)->status(TaskStatus::Todo)->create(['priority' => 'low']); // fixed, so 'high' below is a real change

        $cases = [
            [['assigned_to' => $other->id], ['task.assigned']],
            [['status' => 'done'], ['task.status_changed']],
            [['title' => 'Renamed'], ['task.updated']],
            [['assigned_to' => null], ['task.updated']],                       // unassigned
            [['assigned_to' => $other->id, 'status' => 'in_progress', 'priority' => 'high'],
                ['task.assigned', 'task.status_changed', 'task.updated']],
            [['title' => 'Renamed'], []],                                     // no real change → no event
        ];

        foreach ($cases as [$body, $expected]) {
            $this->events->reset();
            $this->patchJson("/api/v1/tasks/{$task->id}", $body)->assertOk();
            $this->assertSame($expected, $this->events->events(), 'Body: '.json_encode($body));
        }
    }

    public function test_every_event_payload_matches_the_node_contract_and_never_sends_null(): void
    {
        /** @var list<array<string, mixed>> $captured */
        $captured = [];
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('publish')->withArgs(function (string $channel, string $json) use (&$captured) {
            $captured[] = json_decode($json, true);

            return $channel === 'taskflow:tasks';
        });
        $this->useRealPublisherWith($connection);

        $me = $this->actingAsUser();
        $other = User::factory()->create();

        // Created without an assignee: assignedTo is left out, not null.
        $id = $this->postJson('/api/v1/tasks', ['title' => 'Contract'])->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/tasks/{$id}", ['assigned_to' => $other->id])->assertOk();
        $this->patchJson("/api/v1/tasks/{$id}", ['status' => 'in_progress'])->assertOk();
        $this->patchJson("/api/v1/tasks/{$id}", ['title' => 'Contract v2'])->assertOk();

        $byEvent = collect($captured)->keyBy('event');
        $storedIds = $other->notifications()->pluck('id')->all();

        $this->assertSame(['taskId' => $id, 'title' => 'Contract', 'createdBy' => $me->id], $byEvent['task.created']['payload']);
        $this->assertSame(['taskId' => $id, 'assignedTo' => $other->id, 'title' => 'Contract', 'createdBy' => $me->id, 'assignedBy' => $me->id,
            'notificationId' => $byEvent['task.assigned']['payload']['notificationId'], 'unreadCount' => 1], $byEvent['task.assigned']['payload']);
        $this->assertSame(['taskId' => $id, 'status' => 'in_progress', 'previousStatus' => 'todo', 'title' => 'Contract',
            'assignedTo' => $other->id, 'changedBy' => $me->id, 'notificationId' => $byEvent['task.status_changed']['payload']['notificationId'], 'unreadCount' => 2],
            $byEvent['task.status_changed']['payload']);
        $this->assertSame(['taskId' => $id, 'title' => 'Contract v2', 'assignedTo' => $other->id, 'updatedBy' => $me->id,
            'notificationId' => $byEvent['task.updated']['payload']['notificationId'], 'unreadCount' => 3], $byEvent['task.updated']['payload']);

        // Each notifying event points at a real stored notification of the assignee.
        foreach (['task.assigned', 'task.status_changed', 'task.updated'] as $event) {
            $this->assertContains($byEvent[$event]['payload']['notificationId'], $storedIds);
        }

        foreach ($captured as $message) {
            $this->assertNotContains(null, $message['payload'], 'null in '.$message['event']);
            $this->assertTrue(Str::isUuid($message['eventId']));
        }
        $this->assertCount(4, collect($captured)->pluck('eventId')->unique()); // every eventId unique
    }

    public function test_redis_outage_does_not_break_the_api(): void
    {
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('publish')->andThrow(new RuntimeException('Connection refused'));
        Log::spy();

        $this->useRealPublisherWith($connection);
        $this->actingAsUser();

        $this->postJson('/api/v1/tasks', ['title' => 'Saved anyway'])->assertCreated();

        $this->assertDatabaseHas('tasks', ['title' => 'Saved anyway']);
        Log::shouldHaveReceived('error')->once();
    }

    public function test_no_event_is_published_when_transaction_rolls_back(): void
    {
        $this->actingAsUser();

        try {
            DB::transaction(function () {
                Task::factory()->create();
                throw new RuntimeException('rollback');
            });
        } catch (RuntimeException) {
        }

        $this->events->assertNothingPublished();
    }

    private function useRealPublisherWith(Connection $connection): void
    {
        $redis = Mockery::mock(RedisManager::class);
        $redis->shouldReceive('connection')->with('events')->andReturn($connection);

        $this->app->instance(
            TaskEventPublisher::class,
            new RedisTaskEventPublisher(new RedisRealtimePublisher($redis, 'taskflow:tasks')),
        );
    }
}
