<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(): User
    {
        return User::factory()->create(['email' => 'priya@taskflow.test', 'password' => 'secret-pass']);
    }

    public function test_login_returns_bearer_token_and_user(): void
    {
        $user = $this->makeUser();

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'])
            ->assertOk()
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.role.slug', 'user')
            ->assertJsonPath('data.user.permissions.tasks.create', true)
            ->assertJsonPath('data.user.permissions.users.create', false)
            ->assertJsonMissingPath('data.user.password')
            ->assertJsonStructure(['message', 'data' => ['token', 'token_type', 'expires_at', 'user' => ['id', 'name', 'email', 'is_active', 'role' => ['id', 'name', 'slug'], 'permissions']]]);

        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_login_email_is_case_insensitive(): void
    {
        $this->makeUser();

        $this->postJson('/api/v1/auth/login', ['email' => '  PRIYA@TaskFlow.test ', 'password' => 'secret-pass'])
            ->assertOk();
    }

    public function test_login_with_wrong_password_returns_401(): void
    {
        $this->makeUser();

        $this->assertApiError(
            $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'wrong']),
            401,
            'invalid_credentials',
        );
    }

    public function test_login_with_unknown_email_returns_same_401(): void
    {
        $this->assertApiError(
            $this->postJson('/api/v1/auth/login', ['email' => 'nobody@taskflow.test', 'password' => 'whatever']),
            401,
            'invalid_credentials',
        );
    }

    public function test_login_validates_input(): void
    {
        $this->assertApiError($this->postJson('/api/v1/auth/login', ['email' => 'not-an-email']), 422, 'validation_error');

        $this->postJson('/api/v1/auth/login', ['email' => 'not-an-email'])
            ->assertJsonValidationErrors(['email', 'password'], 'error.details');
    }

    public function test_login_is_rate_limited_after_five_attempts(): void
    {
        $this->makeUser();
        $body = ['email' => 'priya@taskflow.test', 'password' => 'wrong'];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', $body)->assertUnauthorized();
        }

        $response = $this->postJson('/api/v1/auth/login', $body);
        $this->assertApiError($response, 429, 'too_many_requests');
        $response->assertHeader('Retry-After');
    }

    public function test_relogin_from_same_device_replaces_previous_token(): void
    {
        $this->makeUser();
        $body = ['email' => 'priya@taskflow.test', 'password' => 'secret-pass', 'device_name' => 'react-web'];

        $this->postJson('/api/v1/auth/login', $body)->assertOk();
        $this->postJson('/api/v1/auth/login', $body)->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_me_returns_authenticated_user(): void
    {
        $this->makeUser();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'])
            ->json('data.token');

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'priya@taskflow.test');
    }

    public function test_me_without_token_returns_401(): void
    {
        $this->assertApiError($this->getJson('/api/v1/auth/me'), 401, 'unauthenticated');
    }

    public function test_me_with_invalid_token_returns_401(): void
    {
        $this->assertApiError($this->withToken('1|not-a-real-token')->getJson('/api/v1/auth/me'), 401, 'unauthenticated');
    }

    public function test_expired_token_is_rejected(): void
    {
        $this->makeUser();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'])
            ->json('data.token');

        $this->travel(1441)->minutes();
        $this->app['auth']->forgetGuards();

        $this->assertApiError($this->withToken($token)->getJson('/api/v1/auth/me'), 401, 'unauthenticated');
    }

    public function test_logout_revokes_the_token(): void
    {
        $this->makeUser();
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'])
            ->json('data.token');

        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->app['auth']->forgetGuards();
        $this->assertApiError($this->withToken($token)->getJson('/api/v1/auth/me'), 401, 'unauthenticated');
    }
}
