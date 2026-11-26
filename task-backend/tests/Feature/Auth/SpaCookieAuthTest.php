<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Browser login: requests from a SANCTUM_STATEFUL_DOMAINS origin get an HttpOnly
 * session cookie and never a token. (CSRF itself is verified against the running
 * container: Laravel skips CSRF checks inside PHPUnit.)
 */
class SpaCookieAuthTest extends TestCase
{
    use RefreshDatabase;

    private const SPA = ['Origin' => 'http://localhost:5174', 'Referer' => 'http://localhost:5174/login'];

    protected function setUp(): void
    {
        parent::setUp();
        config(['sanctum.stateful' => ['localhost:5174']]);
        User::factory()->create(['email' => 'priya@taskflow.test', 'password' => 'secret-pass']);
    }

    public function test_csrf_cookie_endpoint_sets_xsrf_cookie(): void
    {
        $this->get('/sanctum/csrf-cookie', self::SPA)
            ->assertNoContent()
            ->assertCookie('XSRF-TOKEN');
    }

    public function test_browser_login_uses_httponly_session_cookie_and_returns_no_token(): void
    {
        $response = $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'], self::SPA);

        $response->assertOk()
            ->assertJsonPath('data.auth', 'session')
            ->assertJsonPath('data.user.email', 'priya@taskflow.test')
            ->assertJsonMissingPath('data.token');

        $cookie = collect($response->headers->getCookies())->first(fn ($c) => $c->getName() === config('session.cookie'));
        $this->assertNotNull($cookie, 'Session cookie was not set');
        $this->assertTrue($cookie->isHttpOnly(), 'Session cookie must be HttpOnly');
        $this->assertSame('lax', $cookie->getSameSite());

        $this->assertAuthenticated('web');
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_session_user_can_call_protected_endpoints_and_logout_ends_session(): void
    {
        $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'], self::SPA)->assertOk();

        $this->getJson('/api/v1/auth/me', self::SPA)->assertOk()->assertJsonPath('data.email', 'priya@taskflow.test');

        $this->postJson('/api/v1/auth/logout', [], self::SPA)->assertNoContent();
        $this->assertGuest('web');
    }

    public function test_non_browser_clients_still_get_a_bearer_token(): void
    {
        $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'])
            ->assertOk()
            ->assertJsonPath('data.auth', 'token')
            ->assertJsonPath('data.token_type', 'Bearer');
    }

    public function test_deactivated_session_user_is_logged_out(): void
    {
        $this->postJson('/api/v1/auth/login', ['email' => 'priya@taskflow.test', 'password' => 'secret-pass'], self::SPA)->assertOk();

        User::query()->where('email', 'priya@taskflow.test')->update(['is_active' => false]);
        $this->app['auth']->guard('web')->user()->refresh();

        $this->assertApiError($this->getJson('/api/v1/tasks', self::SPA), 403, 'account_inactive');
        $this->assertGuest('web');
    }
}
