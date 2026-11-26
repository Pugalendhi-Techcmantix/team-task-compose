<?php

namespace Tests;

use App\Contracts\RealtimePublisher;
use App\Contracts\TaskEventPublisher;
use App\Models\User;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Fakes\FakeRealtimePublisher;
use Tests\Fakes\FakeTaskEventPublisher;

abstract class TestCase extends BaseTestCase
{
    /** RefreshDatabase seeds the modules, system roles and default permissions before each test. */
    protected bool $seed = true;

    protected string $seeder = AccessControlSeeder::class;

    protected FakeTaskEventPublisher $events;

    protected FakeRealtimePublisher $realtime;

    protected function setUp(): void
    {
        parent::setUp();

        // Tests never talk to real Redis Pub/Sub; they assert on recorded events instead.
        $this->realtime = new FakeRealtimePublisher;
        $this->app->instance(RealtimePublisher::class, $this->realtime);
        $this->events = new FakeTaskEventPublisher;
        $this->app->instance(TaskEventPublisher::class, $this->events);
    }

    protected function actingAsUser(?User $user = null): User
    {
        $user ??= User::factory()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    /** Assert the standard error envelope. */
    protected function assertApiError(TestResponse $response, int $status, string $code): void
    {
        $response->assertStatus($status)
            ->assertJsonPath('error.code', $code)
            ->assertJsonStructure(['error' => ['code', 'message']]);
    }
}
