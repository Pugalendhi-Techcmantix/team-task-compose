<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Database\Seeder;

/**
 * Modules, the two system roles and the default permissions of the "user" role.
 *
 * Create-only: it never overwrites existing rows, so permissions changed by a
 * Super Admin through the API survive container restarts (RUN_SEEDERS=true).
 * To add a module later: add it to MODULES (+ its default in USER_DEFAULTS).
 */
class AccessControlSeeder extends Seeder
{
    public const MODULES = [
        Module::TASKS => ['name' => 'Tasks', 'description' => 'Task board: list, create, edit and delete tasks.'],
        Module::USERS => ['name' => 'Users', 'description' => 'Team members: list, create, edit and delete users.'],
    ];

    public const ROLES = [
        Role::SUPER_ADMIN => ['name' => 'Super Admin', 'description' => 'Full access. Manages roles, permissions and users.'],
        Role::USER => ['name' => 'User', 'description' => 'Standard team member.'],
    ];

    /** Default matrix for the "user" role. (Super Admin needs none: it bypasses all checks.) */
    public const USER_DEFAULTS = [
        Module::TASKS => ['view' => true, 'create' => true, 'update' => true, 'delete' => true],
        Module::USERS => ['view' => true, 'create' => false, 'update' => false, 'delete' => false],
    ];

    public function run(): void
    {
        foreach (self::MODULES as $key => $attributes) {
            Module::query()->firstOrCreate(['key' => $key], $attributes);
        }

        foreach (self::ROLES as $slug => $attributes) {
            $role = Role::query()->firstOrNew(['slug' => $slug], $attributes);
            $role->is_system = true;
            $role->save();
        }

        $userRoleId = Role::idFor(Role::USER);
        $modules = Module::query()->pluck('id', 'key');

        foreach (self::USER_DEFAULTS as $key => $actions) {
            RolePermission::query()->firstOrCreate(
                ['role_id' => $userRoleId, 'module_id' => $modules[$key]],
                collect($actions)->mapWithKeys(fn (bool $v, string $action) => ["can_{$action}" => $v])->all(),
            );
        }
    }
}
