<?php

namespace Tests\Feature\Chat;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationApiTest extends TestCase
{
    use RefreshDatabase;

    private function direct(User $a, User $b): Conversation
    {
        $c = Conversation::query()->create(['type' => Conversation::DIRECT, 'created_by' => $a->id]);
        $c->members()->attach([$a->id, $b->id]);

        return $c;
    }

    private function message(Conversation $c, User $sender, string $body): Message
    {
        $m = Message::query()->create(['conversation_id' => $c->id, 'sender_id' => $sender->id, 'body' => $body]);
        $c->update(['last_message_at' => $m->created_at]);

        return $m;
    }

    // ---------------------------------------------------------------- index

    public function test_lists_only_my_conversations_with_last_message_newest_first(): void
    {
        $me = $this->actingAsUser(User::factory()->create(['name' => 'Me']));
        $priya = User::factory()->create(['name' => 'Priya']);
        $arun = User::factory()->create(['name' => 'Arun']);

        $old = $this->direct($me, $priya);
        $this->message($old, $priya, 'old one');
        $this->travel(1)->minutes();
        $new = $this->direct($me, $arun);
        $this->message($new, $me, 'newest');
        $this->direct($priya, $arun); // not mine

        $this->getJson('/api/v1/conversations')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.0.name', 'Arun')                 // direct chat → other person's name
            ->assertJsonPath('data.0.lastMessage.message', 'newest')
            ->assertJsonPath('data.0.lastMessage.senderId', $me->id)
            ->assertJsonPath('data.1.id', $old->id)
            ->assertJsonStructure(['data' => [['id', 'type', 'title', 'name', 'members' => [['id', 'name', 'email']],
                'lastMessage' => ['id', 'conversationId', 'senderId', 'message', 'createdAt'], 'lastMessageAt', 'createdBy', 'createdAt']],
                'meta' => ['total', 'per_page']]);
    }

    public function test_requires_login(): void
    {
        $this->assertApiError($this->getJson('/api/v1/conversations'), 401, 'unauthenticated');
    }

    // ---------------------------------------------------------------- store

    public function test_direct_chat_is_created_once_then_reused(): void
    {
        $this->actingAsUser();
        $other = User::factory()->create();

        $first = $this->postJson('/api/v1/conversations', ['type' => 'direct', 'user_id' => $other->id]);
        $first->assertCreated()
            ->assertHeader('Location', route('conversations.show', $first->json('data.id')))
            ->assertJsonPath('data.type', 'direct')
            ->assertJsonCount(2, 'data.members');

        $this->postJson('/api/v1/conversations', ['type' => 'direct', 'user_id' => $other->id])
            ->assertOk()
            ->assertJsonPath('data.id', $first->json('data.id'))
            ->assertJsonPath('message', 'Conversation already exists.');

        $this->assertDatabaseCount('conversations', 1);
    }

    public function test_group_chat_adds_creator_automatically(): void
    {
        $me = $this->actingAsUser();
        [$a, $b] = User::factory()->count(2)->create();

        $this->postJson('/api/v1/conversations', ['type' => 'group', 'title' => 'Release squad', 'member_ids' => [$a->id, $b->id]])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Release squad')
            ->assertJsonCount(3, 'data.members');

        $this->assertDatabaseHas('conversation_members', ['user_id' => $me->id]);
    }

    public function test_conversation_validation(): void
    {
        $me = $this->actingAsUser();
        $inactive = User::factory()->inactive()->create();

        $this->postJson('/api/v1/conversations', ['type' => 'channel'])
            ->assertStatus(422)->assertJsonValidationErrors(['type'], 'error.details');
        $this->postJson('/api/v1/conversations', ['type' => 'direct', 'user_id' => $me->id])
            ->assertStatus(422)->assertJsonPath('error.details.user_id.0', 'You cannot start a direct chat with yourself.');
        $this->postJson('/api/v1/conversations', ['type' => 'direct', 'user_id' => $inactive->id])
            ->assertStatus(422)->assertJsonValidationErrors(['user_id'], 'error.details');
        $this->postJson('/api/v1/conversations', ['type' => 'group', 'member_ids' => [99999, 99999]])
            ->assertStatus(422)->assertJsonValidationErrors(['title', 'member_ids.0', 'member_ids.1'], 'error.details');
    }

    // ---------------------------------------------------------------- show + messages

    public function test_non_member_cannot_read_a_conversation(): void
    {
        $c = $this->direct(User::factory()->create(), User::factory()->create());
        $this->actingAsUser();

        $this->getJson("/api/v1/conversations/{$c->id}")
            ->assertForbidden()->assertJsonPath('error.message', 'You are not a member of this conversation.');
        $this->assertApiError($this->getJson("/api/v1/conversations/{$c->id}/messages"), 403, 'forbidden');
        $this->assertApiError($this->getJson('/api/v1/conversations/999999'), 404, 'not_found');
    }

    public function test_message_history_is_paginated_newest_first_with_cursor(): void
    {
        $me = $this->actingAsUser();
        $other = User::factory()->create();
        $c = $this->direct($me, $other);
        $ids = collect(range(1, 5))->map(fn ($i) => $this->message($c, $i % 2 ? $me : $other, "msg {$i}")->id);

        $page1 = $this->getJson("/api/v1/conversations/{$c->id}/messages?limit=2")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.message', 'msg 5')
            ->assertJsonPath('data.1.message', 'msg 4')
            ->assertJsonPath('meta.hasMore', true)
            ->assertJsonPath('meta.nextBeforeId', $ids[3]);

        $this->getJson("/api/v1/conversations/{$c->id}/messages?limit=2&before_id=".$page1->json('meta.nextBeforeId'))
            ->assertJsonPath('data.0.message', 'msg 3');

        $this->getJson("/api/v1/conversations/{$c->id}/messages?limit=10&before_id={$ids[1]}")
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.hasMore', false)
            ->assertJsonPath('meta.nextBeforeId', null);

        $this->getJson("/api/v1/conversations/{$c->id}/messages?limit=500")->assertStatus(422);
    }

    public function test_message_shape_matches_socket_chat_message(): void
    {
        $me = $this->actingAsUser();
        $c = $this->direct($me, User::factory()->create());
        $m = $this->message($c, $me, 'hello');

        $this->getJson("/api/v1/conversations/{$c->id}/messages")
            ->assertExactJson([
                'data' => [[
                    'id' => $m->id, 'conversationId' => $c->id, 'senderId' => $me->id,
                    'message' => 'hello', 'createdAt' => $m->created_at->toIso8601String(),
                ]],
                'meta' => ['hasMore' => false, 'nextBeforeId' => null, 'limit' => 30],
            ]);
    }
}
