<?php

namespace Tests\Feature\AccessControl;

use App\Models\Module;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Team decision: permission checks are removed from all APIs.
 * Every LOGGED-IN user can do full CRUD; login and data-safety rules (409) still apply.
 * Role permission rows are still stored and returned by /auth/me, but nothing enforces them.
 */
class OpenAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_is_still_required_everywhere(): void
    {
        foreach (['/api/v1/tasks', '/api/v1/users', '/api/v1/roles', '/api/v1/modules', '/api/v1/permissions'] as $url) {
            $this->assertApiError($this->getJson($url), 401, 'unauthenticated');
        }
    }

    public function test_any_user_has_full_task_crud_even_on_others_tasks_and_with_permissions_revoked(): void
    {
        // Even a role with every permission switched off is not blocked any more.
        RolePermission::query()->where('role_id', Role::idFor(Role::USER))
            ->update(['can_view' => false, 'can_create' => false, 'can_update' => false, 'can_delete' => false]);
        $this->actingAsUser();
        $someoneElses = Task::factory()->create();

        $this->getJson('/api/v1/tasks')->assertOk();
        $this->postJson('/api/v1/tasks', ['title' => 'Open access'])->assertCreated();
        $this->getJson("/api/v1/tasks/{$someoneElses->id}")->assertOk();
        $this->patchJson("/api/v1/tasks/{$someoneElses->id}", ['title' => 'Edited by anyone'])->assertOk();
        $this->deleteJson("/api/v1/tasks/{$someoneElses->id}")->assertNoContent();
    }

    public function test_any_user_has_full_user_crud(): void
    {
        $this->actingAsUser();
        $other = User::factory()->create();

        $this->getJson('/api/v1/users')->assertOk();
        $created = $this->postJson('/api/v1/users', [
            'name' => 'Made By Member', 'email' => 'made@taskflow.test',
            'password' => 'secret123', 'password_confirmation' => 'secret123',
            'role_id' => Role::idFor(Role::USER),
        ])->assertCreated();
        $this->getJson("/api/v1/users/{$other->id}")->assertOk();
        $this->patchJson("/api/v1/users/{$other->id}", ['name' => 'Renamed'])->assertOk();
        $this->deleteJson('/api/v1/users/'.$created->json('data.id'))->assertNoContent();
    }

    public function test_any_user_can_manage_roles_and_permission_overrides(): void
    {
        $this->actingAsUser();
        $other = User::factory()->create();

        $this->getJson('/api/v1/roles')->assertOk();
        $this->getJson('/api/v1/modules')->assertOk();
        $this->getJson('/api/v1/permissions')->assertOk();
        $roleId = $this->postJson('/api/v1/roles', ['name' => 'Tester'])->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/roles/{$roleId}", ['permissions' => ['tasks' => ['view' => true]]])->assertOk();
        $this->deleteJson("/api/v1/roles/{$roleId}")->assertNoContent();

        $this->putJson("/api/v1/users/{$other->id}/permissions", [
            'permissions' => [Module::TASKS => ['view' => null, 'create' => null, 'update' => null, 'delete' => false]],
        ])->assertOk();
    }

    public function test_data_safety_rules_still_apply(): void
    {
        $me = $this->actingAsUser(User::factory()->superAdmin()->create());

        $this->assertApiError($this->deleteJson("/api/v1/users/{$me->id}"), 409, 'conflict');                 // not yourself
        $this->assertApiError($this->deleteJson('/api/v1/roles/'.Role::idFor(Role::USER)), 409, 'conflict');  // system role
        $this->assertApiError(
            $this->patchJson('/api/v1/roles/'.Role::idFor(Role::SUPER_ADMIN), ['permissions' => ['tasks' => ['view' => false]]]),
            409,
            'conflict',
        );
    }
}
