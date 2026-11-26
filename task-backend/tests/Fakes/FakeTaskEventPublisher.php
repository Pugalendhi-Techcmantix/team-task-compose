<?php

namespace Tests\Fakes;

use App\Contracts\TaskEventPublisher;
use App\Models\Task;
use PHPUnit\Framework\Assert;

class FakeTaskEventPublisher implements TaskEventPublisher
{
    /** @var list<array{event:string, task_id:int, extra:array<string,mixed>}> */
    public array $published = [];

    public function publish(string $event, Task $task, array $extra = []): void
    {
        $this->published[] = ['event' => $event, 'task_id' => $task->id, 'extra' => $extra];
    }

    public function assertPublished(string $event, int $taskId): void
    {
        Assert::assertContains(
            [$event, $taskId],
            array_map(fn (array $e) => [$e['event'], $e['task_id']], $this->published),
            "Expected [{$event}] for task {$taskId}. Published: ".json_encode($this->published),
        );
    }

    /** @return list<string> event names, in publish order */
    public function events(): array
    {
        return array_column($this->published, 'event');
    }

    public function reset(): void
    {
        $this->published = [];
    }

    public function assertNothingPublished(): void
    {
        Assert::assertSame([], $this->published);
    }
}
