<?php

namespace Tests\Feature\AccessControl;

use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserApiTest extends TestCase
{
    use RefreshDatabase;

    private function validUser(array $overrides = []): array
    {
        return [
            'name' => 'New Person',
            'email' => 'New.Person@TaskFlow.test',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'role_id' => Role::idFor(Role::USER),
            ...$overrides,
        ];
    }

    public function test_super_admin_creates_user_who_can_then_log_in(): void
    {
        $this->actingAsUser(User::factory()->superAdmin()->create());

        $response = $this->postJson('/api/v1/users', $this->validUser());
        $response->assertCreated()
            ->assertHeader('Location', route('users.show', $response->json('data.id')))
            ->assertJsonPath('data.email', 'new.person@taskflow.test')
            ->assertJsonPath('data.role.slug', 'user')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonMissingPath('data.password');

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => 'new.person@taskflow.test', 'password' => 'secret123'])->assertOk();
    }

    public function test_create_user_validation(): void
    {
        $this->actingAsUser(User::factory()->superAdmin()->create());
        User::factory()->create(['email' => 'taken@taskflow.test']);

        $this->postJson('/api/v1/users', $this->validUser([
            'email' => 'TAKEN@taskflow.test',
            'password' => 'short',
            'password_confirmation' => 'different',
            'role_id' => 999,
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password', 'role_id'], 'error.details');
    }

    public function test_list_users_with_filters(): void
    {
        $this->actingAsUser(User::factory()->create(['name' => 'Aaron']));
        User::factory()->superAdmin()->create(['name' => 'Boss']);
        User::factory()->inactive()->create(['name' => 'Gone']);

        $this->getJson('/api/v1/users?role_id='.Role::idFor(Role::SUPER_ADMIN))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Boss');
        $this->getJson('/api/v1/users?is_active=0')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Gone');
        $this->getJson('/api/v1/users?search=aar')
            ->assertJsonCount(1, 'data');
    }

    public function test_super_admin_changes_role_and_deactivates_user_revoking_tokens(): void
    {
        $admin = User::factory()->superAdmin()->create();
        $member = User::factory()->create();
        $member->createToken('react-web');

        $this->actingAsUser($admin);
        $this->patchJson("/api/v1/users/{$member->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $member->id]);
    }

    public function test_cannot_change_own_role_deactivate_or_delete_self(): void
    {
        $admin = $this->actingAsUser(User::factory()->superAdmin()->create());
        User::factory()->superAdmin()->create(); // not the last super admin

        $this->assertApiError($this->patchJson("/api/v1/users/{$admin->id}", ['role_id' => Role::idFor(Role::USER)]), 409, 'conflict');
        $this->assertApiError($this->patchJson("/api/v1/users/{$admin->id}", ['is_active' => false]), 409, 'conflict');
        $this->assertApiError($this->deleteJson("/api/v1/users/{$admin->id}"), 409, 'conflict');
    }

    public function test_last_super_admin_cannot_be_demoted_or_deleted(): void
    {
        $lastAdmin = User::factory()->superAdmin()->create();
        $otherAdmin = User::factory()->superAdmin()->inactive()->create(); // inactive: doesn't count

        $this->actingAsUser($otherAdmin->forceFill(['is_active' => true])); // acting without saving the flag
        $this->deleteJson("/api/v1/users/{$lastAdmin->id}")
            ->assertStatus(409)
            ->assertJsonPath('error.message', 'You cannot delete the last active Super Admin.');
    }

    public function test_deleted_user_is_soft_deleted_and_keeps_task_history(): void
    {
        $this->actingAsUser(User::factory()->superAdmin()->create());
        $member = User::factory()->create(['name' => 'Leaving Soon']);
        $task = Task::factory()->createdBy($member)->create();

        $this->deleteJson("/api/v1/users/{$member->id}")->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $member->id]);
        $this->getJson("/api/v1/tasks/{$task->id}")->assertJsonPath('data.creator.name', 'Leaving Soon');
        $this->assertApiError($this->getJson("/api/v1/users/{$member->id}"), 404, 'not_found');
    }

    public function test_user_permissions_report_and_override_lifecycle(): void
    {
        $this->actingAsUser(User::factory()->superAdmin()->create());
        $member = User::factory()->create();

        $this->putJson("/api/v1/users/{$member->id}/permissions", [
            'permissions' => ['users' => ['view' => null, 'create' => true, 'update' => null, 'delete' => null]],
        ])
            ->assertOk()
            ->assertJsonPath('data.modules.1.module', 'users')
            ->assertJsonPath('data.modules.1.role.create', false)
            ->assertJsonPath('data.modules.1.override.create', true)
            ->assertJsonPath('data.modules.1.effective.create', true)
            ->assertJsonPath('data.modules.1.override.view', null);

        $this->assertDatabaseCount('user_permissions', 1);

        // All-null removes the override row entirely.
        $this->putJson("/api/v1/users/{$member->id}/permissions", [
            'permissions' => ['users' => ['view' => null, 'create' => null, 'update' => null, 'delete' => null]],
        ])->assertOk()->assertJsonPath('data.modules.1.effective.create', false);

        $this->assertDatabaseCount('user_permissions', 0);
    }
}
