<?php

namespace Tests\Feature\Chat;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ChatUnreadTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $gamer;

    private User $third;

    private Conversation $direct;

    private Conversation $group;

    protected function setUp(): void
    {
        parent::setUp();

        $this->me = User::factory()->create(['name' => 'Mathan']);
        $this->gamer = User::factory()->create(['name' => 'Gamer']);
        $this->third = User::factory()->create(['name' => 'Third']);

        $this->direct = Conversation::query()->create(['type' => Conversation::DIRECT, 'created_by' => $this->me->id]);
        $this->direct->members()->attach([$this->me->id, $this->gamer->id]);

        $this->group = Conversation::query()->create(['type' => Conversation::GROUP, 'title' => 'Team', 'created_by' => $this->me->id]);
        $this->group->members()->attach([$this->me->id, $this->gamer->id, $this->third->id]);
    }

    /** Send through the internal API, exactly like Node does. */
    private function send(Conversation $conversation, User $sender, string $text = 'Hello'): int
    {
        return $this->postJson(
            "/api/v1/internal/conversations/{$conversation->id}/messages",
            ['conversationId' => $conversation->id, 'senderId' => $sender->id, 'message' => $text],
            ['Authorization' => 'Bearer '.config('services.realtime.service_token')],
        )->assertCreated()->json('data.id');
    }

    /** @return list<array<string, mixed>> */
    private function unreadEvents(): array
    {
        return array_values(array_map(
            fn ($e) => $e['payload'],
            array_filter($this->realtime->published, fn ($e) => $e['event'] === 'chat.unread_changed'),
        ));
    }

    // ---------------------------------------------------------------- counts

    public function test_conversation_list_has_unread_count_excluding_my_own_messages(): void
    {
        $this->send($this->direct, $this->gamer, 'one');
        $this->send($this->direct, $this->gamer, 'two');
        $this->send($this->direct, $this->me, 'my reply');   // own message is never unread for me
        $this->send($this->group, $this->third, 'group hi');

        $this->actingAsUser($this->me);
        $list = collect($this->getJson('/api/v1/conversations')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame(2, $list[$this->direct->id]['unreadCount']);
        $this->assertSame(1, $list[$this->group->id]['unreadCount']);
        $this->getJson('/api/v1/conversations/unread-count')->assertOk()->assertExactJson(['data' => ['unread_count' => 3]]);
        $this->getJson("/api/v1/conversations/{$this->direct->id}")->assertJsonPath('data.unreadCount', 2);

        // The sender sees none of their own messages as unread.
        $this->actingAsUser($this->gamer);
        $this->getJson('/api/v1/conversations/unread-count')->assertExactJson(['data' => ['unread_count' => 2]]); // "my reply" + "group hi"
    }

    public function test_mark_read_resets_one_conversation_and_returns_total(): void
    {
        $this->send($this->direct, $this->gamer);
        $this->send($this->direct, $this->gamer);
        $this->send($this->group, $this->gamer);

        $this->actingAsUser($this->me);
        $this->postJson("/api/v1/conversations/{$this->direct->id}/read")
            ->assertOk()
            ->assertExactJson(['data' => ['conversationId' => $this->direct->id, 'unreadCount' => 0, 'totalUnread' => 1]]);

        $this->assertSame($this->direct->messages()->max('id'), $this->lastRead($this->direct, $this->me));
        $this->getJson('/api/v1/conversations/unread-count')->assertExactJson(['data' => ['unread_count' => 1]]);

        // A newer message after reading counts again.
        $this->send($this->direct, $this->gamer);
        $this->getJson('/api/v1/conversations/unread-count')->assertExactJson(['data' => ['unread_count' => 2]]);

        // Reading an empty conversation is fine.
        $empty = Conversation::query()->create(['type' => Conversation::GROUP, 'title' => 'Empty', 'created_by' => $this->me->id]);
        $empty->members()->attach([$this->me->id]);
        $this->postJson("/api/v1/conversations/{$empty->id}/read")->assertOk()->assertJsonPath('data.unreadCount', 0);
    }

    public function test_only_members_can_mark_read(): void
    {
        $outsider = $this->actingAsUser();

        $this->assertApiError($this->postJson("/api/v1/conversations/{$this->direct->id}/read"), 403, 'forbidden');
        $this->assertApiError($this->postJson('/api/v1/conversations/999999/read'), 404, 'not_found');
        $this->assertSame([], $this->unreadEvents());
        $this->assertNotNull($outsider);
    }

    public function test_unread_endpoints_require_login(): void
    {
        $this->assertApiError($this->getJson('/api/v1/conversations/unread-count'), 401, 'unauthenticated');
        $this->assertApiError($this->postJson("/api/v1/conversations/{$this->direct->id}/read"), 401, 'unauthenticated');
    }

    // ---------------------------------------------------------------- Redis events

    public function test_new_message_publishes_one_event_per_member_except_the_sender(): void
    {
        $this->send($this->direct, $this->gamer, 'earlier');           // me: direct 1
        $this->realtime->published = [];

        $long = str_repeat('é', 250);                                  // multibyte: cut at 200 characters, not bytes
        $id = $this->send($this->group, $this->gamer, $long);

        $events = collect($this->unreadEvents())->keyBy('userId');
        $this->assertSame([$this->me->id, $this->third->id], $events->keys()->sort()->values()->all()); // not the sender

        $lastMessage = ['id' => $id, 'senderId' => $this->gamer->id, 'senderName' => 'Gamer', 'message' => str_repeat('é', 200)];
        $this->assertSame(
            ['userId' => $this->me->id, 'conversationId' => $this->group->id, 'unreadCount' => 1, 'totalUnread' => 2, 'lastMessage' => $lastMessage],
            $events[$this->me->id],
        );
        $this->assertSame(
            ['userId' => $this->third->id, 'conversationId' => $this->group->id, 'unreadCount' => 1, 'totalUnread' => 1, 'lastMessage' => $lastMessage],
            $events[$this->third->id],
        );
    }

    public function test_mark_read_publishes_one_event_for_the_reader_without_last_message(): void
    {
        $this->send($this->direct, $this->gamer);
        $this->send($this->group, $this->gamer);
        $this->realtime->published = [];

        $this->actingAsUser($this->me);
        $this->postJson("/api/v1/conversations/{$this->direct->id}/read")->assertOk();

        $this->assertSame(
            [['userId' => $this->me->id, 'conversationId' => $this->direct->id, 'unreadCount' => 0, 'totalUnread' => 1]],
            $this->unreadEvents(),
        );
    }

    public function test_events_are_published_only_after_commit(): void
    {
        try {
            DB::transaction(function () {
                Message::query()->create(['conversation_id' => $this->direct->id, 'sender_id' => $this->gamer->id, 'body' => 'rolled back']);
                throw new \RuntimeException('rollback');
            });
        } catch (\RuntimeException) {
        }

        $this->assertSame([], $this->unreadEvents());
    }

    private function lastRead(Conversation $conversation, User $user): ?int
    {
        $value = DB::table('conversation_members')
            ->where(['conversation_id' => $conversation->id, 'user_id' => $user->id])
            ->value('last_read_message_id');

        return $value === null ? null : (int) $value;
    }
}
