<?php

namespace App\Services;

use App\Contracts\RealtimePublisher;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Support\Facades\DB;

/**
 * Chat unread counts and the "chat.unread_changed" Redis event for Node.js.
 *
 * Unread for a member = messages in the conversation with id > their last_read_message_id
 * (NULL = nothing read) that they did not send themselves.
 */
class ChatUnread
{
    public const EVENT = 'chat.unread_changed';

    public const PREVIEW_LENGTH = 200;

    public function __construct(private readonly RealtimePublisher $realtime) {}

    /** Unread in one conversation, per member: [userId => count]. @param  list<int>  $userIds */
    public function perConversation(int $conversationId, array $userIds): array
    {
        return $this->counts($userIds, $conversationId);
    }

    /** Unread across all of each member's conversations: [userId => count]. @param  list<int>  $userIds */
    public function totals(array $userIds): array
    {
        return $this->counts($userIds);
    }

    public function totalFor(int $userId): int
    {
        return $this->totals([$userId])[$userId];
    }

    /** Move the member's read pointer to the latest message (never backwards). */
    public function markRead(Conversation $conversation, int $userId): void
    {
        $latestId = $conversation->messages()->max('id');

        if ($latestId === null) {
            return;
        }

        DB::table('conversation_members')
            ->where(['conversation_id' => $conversation->id, 'user_id' => $userId])
            ->update(['last_read_message_id' => DB::raw('GREATEST(COALESCE(last_read_message_id, 0), '.(int) $latestId.')')]);
    }

    /** One event per member except the sender. Call after the message is committed. */
    public function publishNewMessage(Message $message): void
    {
        $recipients = DB::table('conversation_members')
            ->where('conversation_id', $message->conversation_id)
            ->where('user_id', '!=', $message->sender_id)
            ->pluck('user_id')->map(fn ($id) => (int) $id)->all();

        if ($recipients === []) {
            return;
        }

        $lastMessage = [
            'id' => $message->id,
            'senderId' => $message->sender_id,
            'senderName' => (string) $message->sender?->name,
            'message' => mb_substr($message->body, 0, self::PREVIEW_LENGTH),
        ];

        $this->publishFor($message->conversation_id, $recipients, $lastMessage);
    }

    /** One event for the reader (no lastMessage). */
    public function publishRead(int $conversationId, int $userId): void
    {
        $this->publishFor($conversationId, [$userId]);
    }

    /** @param  list<int>  $userIds  @param  array<string, mixed>|null  $lastMessage */
    private function publishFor(int $conversationId, array $userIds, ?array $lastMessage = null): void
    {
        $inConversation = $this->perConversation($conversationId, $userIds);
        $totals = $this->totals($userIds);

        foreach ($userIds as $userId) {
            $payload = [
                'userId' => $userId,
                'conversationId' => $conversationId,
                'unreadCount' => $inConversation[$userId],
                'totalUnread' => $totals[$userId],
            ];
            if ($lastMessage !== null) {
                $payload['lastMessage'] = $lastMessage; // new-message events only
            }

            $this->realtime->publish(self::EVENT, $payload);
        }
    }

    /**
     * One query for any number of members. Every requested user gets a key (0 when nothing is unread).
     *
     * @param  list<int>  $userIds
     * @return array<int, int>
     */
    private function counts(array $userIds, ?int $conversationId = null): array
    {
        $rows = DB::table('conversation_members as cm')
            ->join('messages as m', function ($join) {
                $join->on('m.conversation_id', '=', 'cm.conversation_id')
                    ->whereColumn('m.sender_id', '!=', 'cm.user_id')
                    ->whereRaw('m.id > COALESCE(cm.last_read_message_id, 0)');
            })
            ->whereIn('cm.user_id', $userIds)
            ->when($conversationId, fn ($q) => $q->where('cm.conversation_id', $conversationId))
            ->groupBy('cm.user_id')
            ->selectRaw('cm.user_id, count(m.id) AS unread')
            ->pluck('unread', 'user_id');

        $counts = array_fill_keys($userIds, 0);
        foreach ($rows as $userId => $count) {
            $counts[(int) $userId] = (int) $count;
        }

        return $counts;
    }
}
