<?php

namespace App\Http\Controllers\Api\V1\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\StoreInternalMessageRequest;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Service-to-service endpoints for the Node.js realtime service
 * (guarded by EnsureServiceToken, never reachable from the browser via the gateway).
 * Laravel stores chat messages; Node only delivers them live.
 */
class ConversationController extends Controller
{
    /** GET /api/v1/internal/conversations/{conversation}/members/{user} */
    public function member(Conversation $conversation, User $user): JsonResponse
    {
        if (! $user->is_active) {
            return $this->error(Response::HTTP_FORBIDDEN, 'account_inactive', 'This user account is deactivated.');
        }

        if (! $conversation->hasMember($user->id)) {
            return $this->error(Response::HTTP_NOT_FOUND, 'not_a_member', 'The user is not a member of this conversation.');
        }

        return response()->json([
            'data' => ['conversationId' => $conversation->id, 'userId' => $user->id, 'isMember' => true],
        ]);
    }

    /** POST /api/v1/internal/conversations/{conversation}/messages */
    public function storeMessage(StoreInternalMessageRequest $request, Conversation $conversation): JsonResponse
    {
        $sender = User::query()->find((int) $request->validated('senderId')); // soft-deleted users excluded

        if (! $sender) {
            return $this->error(Response::HTTP_FORBIDDEN, 'not_a_member', 'The sender is not a member of this conversation.');
        }
        if (! $sender->is_active) {
            return $this->error(Response::HTTP_FORBIDDEN, 'account_inactive', 'The sender account is deactivated.');
        }
        if (! $conversation->hasMember($sender->id)) {
            return $this->error(Response::HTTP_FORBIDDEN, 'not_a_member', 'The sender is not a member of this conversation.');
        }

        $message = DB::transaction(function () use ($conversation, $sender, $request) {
            $message = Message::query()->create([
                'conversation_id' => $conversation->id,
                'sender_id' => $sender->id,
                'body' => $request->validated('message'),
            ]);

            $conversation->forceFill(['last_message_at' => $message->created_at])->save();

            return $message;
        });

        return response()->json([
            'data' => [
                'id' => $message->id,
                'createdAt' => $message->created_at->toIso8601String(),
            ],
        ], Response::HTTP_CREATED);
    }

    private function error(int $status, string $code, string $message): JsonResponse
    {
        return response()->json(['error' => ['code' => $code, 'message' => $message]], $status);
    }
}
