<?php

namespace Database\Seeders;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Sample conversations so the Node.js realtime service can be tested
 * (there is no user-facing chat API yet). Create-only.
 */
class ChatSeeder extends Seeder
{
    public function run(): void
    {
        $users = User::query()->pluck('id', 'email');
        $admin = $users['admin@taskflow.test'] ?? null;
        $priya = $users['priya@taskflow.test'] ?? null;
        $arun = $users['arun@taskflow.test'] ?? null;

        if (! $admin || ! $priya || ! $arun) {
            return; // UserSeeder must run first
        }

        // Group chat with the whole team.
        if (! Conversation::query()->where('type', Conversation::GROUP)->where('title', 'TaskFlow Team')->exists()) {
            $this->conversation(Conversation::GROUP, 'TaskFlow Team', $admin, [$admin, $priya, $arun], [
                [$admin, 'Welcome to the TaskFlow team chat!'],
                [$priya, 'Hi all, the React task list is in progress.'],
            ]);
        }

        // 1-to-1 chat between Priya and Arun.
        $directExists = Conversation::query()
            ->where('type', Conversation::DIRECT)
            ->whereHas('members', fn ($q) => $q->whereKey($priya))
            ->whereHas('members', fn ($q) => $q->whereKey($arun))
            ->exists();

        if (! $directExists) {
            $this->conversation(Conversation::DIRECT, null, $priya, [$priya, $arun], [
                [$priya, 'Arun, can you check the Socket.IO events?'],
                [$arun, 'Sure, testing them now.'],
            ]);
        }
    }

    /**
     * @param  list<int>  $memberIds
     * @param  list<array{0:int, 1:string}>  $messages
     */
    private function conversation(string $type, ?string $title, int $createdBy, array $memberIds, array $messages): void
    {
        $conversation = Conversation::query()->create(['type' => $type, 'title' => $title, 'created_by' => $createdBy]);
        $conversation->members()->attach($memberIds);

        // Sample history: no live "chat.unread_changed" events while seeding.
        $message = Message::withoutEvents(function () use ($messages, $conversation) {
            $message = null;
            foreach ($messages as [$senderId, $body]) {
                $message = Message::query()->create([
                    'conversation_id' => $conversation->id,
                    'sender_id' => $senderId,
                    'body' => $body,
                ]);
            }

            return $message;
        });

        $conversation->update(['last_message_at' => $message->created_at]);
    }
}
