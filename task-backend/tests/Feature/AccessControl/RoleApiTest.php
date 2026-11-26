<?php

namespace Tests\Feature\AccessControl;

use App\Models\Module;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleApiTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsSuperAdmin(): User
    {
        return $this->actingAsUser(User::factory()->superAdmin()->create());
    }

    public function test_super_admin_lists_roles_with_permission_matrix(): void
    {
        $this->actingAsSuperAdmin();

        $this->getJson('/api/v1/roles')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.slug', 'super_admin')
            ->assertJsonPath('data.0.permissions.tasks.delete', true)
            ->assertJsonPath('data.1.slug', 'user')
            ->assertJsonPath('data.1.permissions.users.create', false)
            ->assertJsonPath('data.1.users_count', 0);
    }

    public function test_super_admin_creates_role_with_permissions(): void
    {
        $admin = $this->actingAsSuperAdmin();

        $response = $this->postJson('/api/v1/roles', [
            'name' => 'Team Lead',
            'description' => 'Leads a squad',
            'permissions' => [
                'tasks' => ['view' => true, 'create' => true, 'update' => true, 'delete' => false],
            ],
        ]);

        $id = $response->json('data.id');
        $response->assertCreated()
            ->assertHeader('Location', route('roles.show', $id))
            ->assertJsonPath('data.slug', 'team_lead')
            ->assertJsonPath('data.is_system', false)
            ->assertJsonPath('data.permissions.tasks.update', true)
            ->assertJsonPath('data.permissions.users.view', false); // modules not sent default to false

        $this->assertDatabaseHas('role_permissions', ['role_id' => $id, 'can_delete' => false, 'updated_by' => $admin->id]);
    }

    public function test_role_validation(): void
    {
        $this->actingAsSuperAdmin();

        $this->postJson('/api/v1/roles', [
            'name' => '1bad',
            'permissions' => ['invoices' => ['view' => true], 'tasks' => ['fly' => true]],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'permissions', 'permissions.tasks'], 'error.details');

        $this->postJson('/api/v1/roles', ['name' => 'USER'])
            ->assertStatus(422)
            ->assertJsonPath('error.details.name.0', 'A role with this name already exists.');
    }

    public function test_super_admin_updates_only_the_permissions_sent(): void
    {
        $this->actingAsSuperAdmin();
        $roleId = Role::idFor(Role::USER);

        $this->patchJson("/api/v1/roles/{$roleId}", ['permissions' => ['tasks' => ['delete' => false]]])
            ->assertOk()
            ->assertJsonPath('data.permissions.tasks.delete', false)
            ->assertJsonPath('data.permissions.tasks.create', true); // untouched
    }

    public function test_super_admin_role_permissions_cannot_be_changed(): void
    {
        $this->actingAsSuperAdmin();

        $this->assertApiError(
            $this->patchJson('/api/v1/roles/'.Role::idFor(Role::SUPER_ADMIN), ['permissions' => ['tasks' => ['view' => false]]]),
            409,
            'conflict',
        );
    }

    public function test_system_role_cannot_be_deleted_and_role_in_use_cannot_be_deleted(): void
    {
        $this->actingAsSuperAdmin();
        $this->assertApiError($this->deleteJson('/api/v1/roles/'.Role::idFor(Role::USER)), 409, 'conflict');

        $role = Role::factory()->create();
        User::factory()->role($role)->create();
        $this->deleteJson("/api/v1/roles/{$role->id}")
            ->assertStatus(409)
            ->assertJsonPath('error.message', 'This role is assigned to 1 user(s). Move them to another role first.');
    }

    public function test_unused_custom_role_can_be_deleted(): void
    {
        $this->actingAsSuperAdmin();
        $role = Role::factory()->create();

        $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();
        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
    }

    public function test_role_options_dropdown_for_user_with_users_view(): void
    {
        $this->actingAsUser(); // seeded "user" role has users.view

        $this->getJson('/api/v1/roles/options')
            ->assertOk()
            ->assertExactJson(['data' => [
                ['id' => Role::idFor(Role::SUPER_ADMIN), 'name' => 'Super Admin', 'slug' => 'super_admin', 'assignable' => true],
                ['id' => Role::idFor(Role::USER), 'name' => 'User', 'slug' => 'user', 'assignable' => true],
            ]]);
    }

    public function test_role_options_marks_everything_assignable_for_super_admin(): void
    {
        $this->actingAsSuperAdmin();

        $this->getJson('/api/v1/roles/options')
            ->assertOk()
            ->assertJsonPath('data.0.assignable', true)
            ->assertJsonMissingPath('data.0.permissions');
    }

    public function test_role_options_needs_login_but_no_permission(): void
    {
        $this->assertApiError($this->getJson('/api/v1/roles/options'), 401, 'unauthenticated');

        RolePermission::query()
            ->where('role_id', Role::idFor(Role::USER))
            ->where('module_id', Module::query()->where('key', 'users')->value('id'))
            ->update(['can_view' => false, 'can_create' => false, 'can_update' => false, 'can_delete' => false]);
        $this->actingAsUser();

        $this->getJson('/api/v1/roles/options')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_permissions_endpoint_lists_every_module_action_pair(): void
    {
        $this->actingAsSuperAdmin();

        $this->getJson('/api/v1/permissions')
            ->assertOk()
            ->assertJsonCount(8, 'data') // 2 modules × 4 actions
            ->assertJsonPath('data.0', [
                'key' => 'tasks.view', 'module' => 'tasks', 'module_name' => 'Tasks',
                'action' => 'view', 'label' => 'View tasks',
            ])
            ->assertJsonPath('data.7.key', 'users.delete')
            ->assertJsonPath('meta.total', 8);
    }

    public function test_permissions_cannot_be_created_through_the_api(): void
    {
        $this->actingAsSuperAdmin();

        $this->assertApiError($this->postJson('/api/v1/permissions', ['key' => 'reports.view']), 405, 'method_not_allowed');
    }

    public function test_modules_endpoint_lists_matrix_columns(): void
    {
        $this->actingAsSuperAdmin();

        $this->getJson('/api/v1/modules')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'tasks')
            ->assertJsonPath('data.1.key', 'users')
            ->assertJsonPath('meta.actions', ['view', 'create', 'update', 'delete']);
    }
}
