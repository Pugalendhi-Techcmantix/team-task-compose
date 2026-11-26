<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\IndexTaskRequest;
use App\Http\Requests\Task\StoreTaskRequest;
use App\Http\Requests\Task\UpdateTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class TaskController extends Controller
{
    private const RELATIONS = ['creator:id,name,email', 'assignee:id,name,email'];

    /** GET /api/v1/tasks */
    public function index(IndexTaskRequest $request): AnonymousResourceCollection
    {
        $tasks = Task::query()
            ->with(self::RELATIONS)
            ->filter($request->validated())
            ->sortBy($request->validated('sort'))
            ->paginate($request->perPage())
            ->withQueryString();

        return TaskResource::collection($tasks);
    }

    /** POST /api/v1/tasks */
    public function store(StoreTaskRequest $request): JsonResponse
    {
        $task = DB::transaction(function () use ($request) {
            $task = new Task($request->validated());
            $task->created_by = $request->user()->id;
            $task->save();

            return $task;
        });

        return (new TaskResource($task->load(self::RELATIONS)))
            ->additional(['message' => 'Task created successfully.'])
            ->response()
            ->setStatusCode(Response::HTTP_CREATED)
            ->header('Location', route('tasks.show', $task));
    }

    /** GET /api/v1/tasks/{task} */
    public function show(Task $task): TaskResource
    {
        return new TaskResource($task->load(self::RELATIONS));
    }

    /** PUT|PATCH /api/v1/tasks/{task} — partial update. */
    public function update(UpdateTaskRequest $request, Task $task): TaskResource
    {
        DB::transaction(fn () => $task->update($request->validated()));

        return (new TaskResource($task->refresh()->load(self::RELATIONS)))
            ->additional(['message' => 'Task updated successfully.']);
    }

    /** DELETE /api/v1/tasks/{task} — soft delete. */
    public function destroy(Task $task): Response
    {
        DB::transaction(fn () => $task->delete());

        return response()->noContent();
    }
}
