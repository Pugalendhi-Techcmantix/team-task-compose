<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Notifications\DatabaseNotification;

/**
 * Laravel's standard database-notification shape, as the frontend expects:
 * { id, type, data: { type, title, message, task_id }, read_at, created_at }
 *
 * @mixin DatabaseNotification
 */
class NotificationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $data = $this->data ?? [];

        return [
            'id' => $this->id,
            'type' => $this->type,
            'data' => [
                'type' => $data['type'] ?? $this->type,
                'title' => $data['title'] ?? null,
                'message' => $data['message'] ?? null,
                'task_id' => $data['task_id'] ?? $data['taskId'] ?? null, // taskId: rows stored before the contract change
            ],
            'read_at' => $this->read_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
