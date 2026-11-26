<?php

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Task */
class TaskResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status->value,
            'priority' => $this->priority->value,
            'due_date' => $this->due_date?->format('Y-m-d'),
            'is_overdue' => $this->due_date !== null
                && $this->completed_at === null
                && $this->due_date->isBefore(today()),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'created_by' => $this->created_by,
            'assigned_to' => $this->assigned_to,
            // Callers eager-load these (TaskController / publisher) to avoid N+1 queries.
            'creator' => $this->userSummary($this->creator),
            'assignee' => $this->userSummary($this->assignee),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /** @return array{id:int,name:string,email:string}|null */
    private function userSummary(mixed $user): ?array
    {
        return $user ? ['id' => $user->id, 'name' => $user->name, 'email' => $user->email] : null;
    }
}
