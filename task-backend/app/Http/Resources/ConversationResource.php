<?php

namespace App\Http\Resources;

use App\Models\Conversation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Chat resources use camelCase, like the realtime (socket) contract.
 *
 * @mixin Conversation
 */
class ConversationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'title' => $this->title,
            'name' => $this->whenLoaded('members', fn () => $this->displayNameFor((int) $request->user()->id)),
            'members' => $this->whenLoaded('members', fn () => $this->members->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
            ])->values()),
            'lastMessage' => $this->whenLoaded('lastMessage', fn () => $this->lastMessage
                ? (new MessageResource($this->lastMessage))->resolve($request)
                : null),
            'unreadCount' => $this->whenHas('unread_count', fn ($count) => (int) $count),
            'lastMessageAt' => $this->last_message_at?->toIso8601String(),
            'createdBy' => $this->created_by,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
