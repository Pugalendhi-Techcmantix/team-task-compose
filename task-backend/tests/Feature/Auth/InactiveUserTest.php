<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InactiveUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_inactive_user_cannot_log_in(): void
    {
        User::factory()->inactive()->create(['email' => 'off@taskflow.test', 'password' => 'secret-pass']);

        $this->assertApiError(
            $this->postJson('/api/v1/auth/login', ['email' => 'off@taskflow.test', 'password' => 'secret-pass']),
            403,
            'account_inactive',
        );
    }

    public function test_inactive_user_with_wrong_password_gets_generic_401(): void
    {
        User::factory()->inactive()->create(['email' => 'off@taskflow.test', 'password' => 'secret-pass']);

        // Account state is only revealed after a correct password.
        $this->assertApiError(
            $this->postJson('/api/v1/auth/login', ['email' => 'off@taskflow.test', 'password' => 'wrong']),
            401,
            'invalid_credentials',
        );
    }

    public function test_existing_token_stops_working_once_deactivated(): void
    {
        $user = User::factory()->create(['email' => 'soon-off@taskflow.test', 'password' => 'secret-pass']);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'soon-off@taskflow.test', 'password' => 'secret-pass'])
            ->json('data.token');

        $user->update(['is_active' => false]);
        $this->app['auth']->forgetGuards();

        $this->assertApiError($this->withToken($token)->getJson('/api/v1/tasks'), 403, 'account_inactive');
    }

    public function test_deleted_user_cannot_log_in(): void
    {
        $user = User::factory()->create(['email' => 'deleted@taskflow.test', 'password' => 'secret-pass']);
        $user->delete();

        $this->assertApiError(
            $this->postJson('/api/v1/auth/login', ['email' => 'deleted@taskflow.test', 'password' => 'secret-pass']),
            401,
            'invalid_credentials',
        );
    }
}
