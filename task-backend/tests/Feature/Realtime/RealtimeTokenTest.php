<?php

namespace Tests\Feature\Realtime;

use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RealtimeTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_short_lived_hs256_jwt_for_bearer_user(): void
    {
        $user = $this->actingAsUser();

        $response = $this->postJson('/api/v1/realtime/token')
            ->assertOk()
            ->assertJsonStructure(['data' => ['token', 'expires_at']]);

        $claims = JWT::decode($response->json('data.token'), new Key(config('services.realtime.secret'), 'HS256'));

        $this->assertSame((string) $user->id, $claims->sub);
        $this->assertSame('taskflow', $claims->iss);
        $this->assertSame('realtime-service', $claims->aud);
        $this->assertSame(900, $claims->exp - $claims->iat);
        $this->assertSame(date(DATE_ATOM, $claims->exp), $response->json('data.expires_at'));
    }

    public function test_works_for_browser_cookie_session(): void
    {
        config(['sanctum.stateful' => ['localhost:5174']]);
        $spa = ['Origin' => 'http://localhost:5174', 'Referer' => 'http://localhost:5174/'];
        User::factory()->create(['email' => 'priya@taskflow.test', 'password' => 'secret-pass']);

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'], $spa)->assertOk();

        $this->postJson('/api/v1/realtime/token', [], $spa)->assertOk()->assertJsonStructure(['data' => ['token']]);
    }

    public function test_requires_login(): void
    {
        $this->assertApiError($this->postJson('/api/v1/realtime/token'), 401, 'unauthenticated');
    }

    public function test_refuses_to_sign_with_a_missing_or_weak_secret(): void
    {
        config(['services.realtime.secret' => 'too-short']);
        $this->actingAsUser();

        $this->assertApiError($this->postJson('/api/v1/realtime/token'), 503, 'service_unavailable');
    }
}
