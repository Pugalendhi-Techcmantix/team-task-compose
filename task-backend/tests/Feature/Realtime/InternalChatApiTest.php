<?php

namespace Tests\Feature\Realtime;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InternalChatApiTest extends TestCase
{
    use RefreshDatabase;

    private User $member;

    private User $outsider;

    private Conversation $conversation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->member = User::factory()->create();
        $this->outsider = User::factory()->create();
        $this->conversation = Conversation::query()->create(['type' => Conversation::DIRECT, 'created_by' => $this->member->id]);
        $this->conversation->members()->attach([$this->member->id, User::factory()->create()->id]);
    }

    /** @return array<string, string> */
    private function service(?string $token = null): array
    {
        return ['Authorization' => 'Bearer '.($token ?? config('services.realtime.service_token'))];
    }

    private function memberUrl(int $userId, ?int $conversationId = null): string
    {
        return '/api/v1/internal/conversations/'.($conversationId ?? $this->conversation->id)."/members/{$userId}";
    }

    private function messagesUrl(): string
    {
        return "/api/v1/internal/conversations/{$this->conversation->id}/messages";
    }

    /** @return array<string, mixed> */
    private function body(array $overrides = []): array
    {
        return ['conversationId' => $this->conversation->id, 'senderId' => $this->member->id, 'message' => 'Hello', ...$overrides];
    }

    // ---------------------------------------------------------------- service token

    public function test_internal_api_requires_the_service_token(): void
    {
        $this->assertApiError($this->getJson($this->memberUrl($this->member->id)), 401, 'invalid_service_token');
        $this->assertApiError($this->getJson($this->memberUrl($this->member->id), $this->service('wrong-token')), 401, 'invalid_service_token');

        // A normal user's login (Sanctum) is not a service token.
        $this->actingAsUser($this->member);
        $this->assertApiError($this->postJson($this->messagesUrl(), $this->body()), 401, 'invalid_service_token');
    }

    public function test_internal_api_is_disabled_when_service_token_is_not_configured(): void
    {
        config(['services.realtime.service_token' => 'short']);

        $this->assertApiError($this->getJson($this->memberUrl($this->member->id), $this->service('short')), 401, 'invalid_service_token');
    }

    // ---------------------------------------------------------------- membership

    public function test_member_check(): void
    {
        $this->getJson($this->memberUrl($this->member->id), $this->service())
            ->assertOk()
            ->assertExactJson(['data' => ['conversationId' => $this->conversation->id, 'userId' => $this->member->id, 'isMember' => true]]);

        $this->assertApiError($this->getJson($this->memberUrl($this->outsider->id), $this->service()), 404, 'not_a_member');
        $this->assertApiError($this->getJson($this->memberUrl($this->member->id, 999999), $this->service()), 404, 'not_found');
        $this->assertApiError($this->getJson($this->memberUrl(999999), $this->service()), 404, 'not_found');
    }

    public function test_member_check_rejects_deactivated_user(): void
    {
        $this->member->update(['is_active' => false]);

        $this->assertApiError($this->getJson($this->memberUrl($this->member->id), $this->service()), 403, 'account_inactive');
    }

    // ---------------------------------------------------------------- store message

    public function test_member_message_is_stored(): void
    {
        $response = $this->postJson($this->messagesUrl(), $this->body(['message' => '  Hello team  ']), $this->service());

        $response->assertCreated()->assertJsonStructure(['data' => ['id', 'createdAt']]);
        $this->assertNotFalse(\DateTimeImmutable::createFromFormat(DATE_ATOM, $response->json('data.createdAt')));

        $this->assertDatabaseHas('messages', [
            'id' => $response->json('data.id'),
            'conversation_id' => $this->conversation->id,
            'sender_id' => $this->member->id,
            'body' => 'Hello team', // trimmed
        ]);
        $this->assertNotNull($this->conversation->fresh()->last_message_at);
    }

    public function test_non_member_inactive_or_unknown_sender_is_rejected(): void
    {
        $this->assertApiError($this->postJson($this->messagesUrl(), $this->body(['senderId' => $this->outsider->id]), $this->service()), 403, 'not_a_member');
        $this->assertApiError($this->postJson($this->messagesUrl(), $this->body(['senderId' => 999999]), $this->service()), 403, 'not_a_member');

        $this->member->update(['is_active' => false]);
        $this->assertApiError($this->postJson($this->messagesUrl(), $this->body(), $this->service()), 403, 'account_inactive');

        $this->assertDatabaseCount('messages', 0);
    }

    public function test_message_validation(): void
    {
        $this->postJson($this->messagesUrl(), ['conversationId' => 'x', 'senderId' => null, 'message' => '   '], $this->service())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['conversationId', 'senderId', 'message'], 'error.details');

        $this->postJson($this->messagesUrl(), $this->body(['message' => str_repeat('a', 5001)]), $this->service())
            ->assertStatus(422)->assertJsonValidationErrors(['message'], 'error.details');

        $this->postJson($this->messagesUrl(), $this->body(['conversationId' => $this->conversation->id + 1]), $this->service())
            ->assertStatus(422)
            ->assertJsonPath('error.details.conversationId.0', 'The conversationId must match the conversation in the URL.');
    }
}
