<?php

namespace App\Http\Resources;

use App\Models\Message;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Same shape as the Socket.IO "chat:message" event from Node.js, so React can merge
 * history (REST) and live messages (socket) without mapping:
 * { id, conversationId, senderId, message, createdAt }
 *
 * @mixin Message
 */
class MessageResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'conversationId' => $this->conversation_id,
            'senderId' => $this->sender_id,
            'message' => $this->body,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
