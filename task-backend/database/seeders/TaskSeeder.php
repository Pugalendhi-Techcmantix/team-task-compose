<?php

namespace Database\Seeders;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

/** Demo tasks for the dashboard. Create-only (matched by title). */
class TaskSeeder extends Seeder
{
    public function run(): void
    {
        $users = User::query()->pluck('id', 'email');
        $admin = $users['admin@taskflow.test'];
        $priya = $users['priya@taskflow.test'];
        $arun = $users['arun@taskflow.test'];

        $tasks = [
            ['Set up Docker Compose for all services', TaskStatus::Done, TaskPriority::High, $admin, $arun, -2],
            ['Build task list and create form in React', TaskStatus::InProgress, TaskPriority::High, $admin, $priya, 3],
            ['Wire Socket.IO notifications to the dashboard', TaskStatus::Todo, TaskPriority::Medium, $priya, $arun, 5],
            ['Write API documentation for the team', TaskStatus::Todo, TaskPriority::Low, $arun, null, 10],
            ['Review database indexes before demo', TaskStatus::Todo, TaskPriority::Medium, $admin, $admin, 7],
        ];

        // Seeding must not spam the real-time channel.
        Task::withoutEvents(function () use ($tasks): void {
            foreach ($tasks as [$title, $status, $priority, $creator, $assignee, $dueInDays]) {
                // Create-only: demo tasks edited or deleted through the API are left alone.
                if (Task::withTrashed()->where('title', $title)->exists()) {
                    continue;
                }

                $task = new Task;
                $task->fill([
                    'title' => $title,
                    'status' => $status,
                    'priority' => $priority,
                    'assigned_to' => $assignee,
                    'due_date' => now()->addDays($dueInDays)->toDateString(),
                ]);
                $task->created_by = $creator;
                $task->completed_at = $status === TaskStatus::Done ? now() : null;
                $task->save();
            }
        });
    }
}
