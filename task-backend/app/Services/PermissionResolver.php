<?php

namespace App\Services;

use App\Enums\PermissionAction;
use App\Models\Module;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserPermission;

/**
 * Computes a user's effective permissions:
 *
 *   super admin            → everything
 *   user override (≠ NULL) → wins
 *   role permission        → default
 *   nothing                → false
 */
class PermissionResolver
{
    /**
     * @return array<string, array{view:bool, create:bool, update:bool, delete:bool}>
     */
    public function matrixFor(User $user): array
    {
        $modules = Module::query()->orderBy('id')->pluck('key', 'id');

        if ($user->isSuperAdmin()) {
            return $modules->mapWithKeys(fn (string $key) => [$key => $this->row(fn () => true)])->all();
        }

        $rolePermissions = RolePermission::query()->where('role_id', $user->role_id)->get()->keyBy('module_id');
        $overrides = UserPermission::query()->where('user_id', $user->id)->get()->keyBy('module_id');

        return $modules->mapWithKeys(fn (string $key, int $moduleId) => [
            $key => $this->row(fn (PermissionAction $action) => (bool) (
                $overrides->get($moduleId)?->{$action->column()}
                ?? $rolePermissions->get($moduleId)?->{$action->column()}
                ?? false
            )),
        ])->all();
    }

    /**
     * @param  callable(PermissionAction): bool  $resolve
     * @return array{view:bool, create:bool, update:bool, delete:bool}
     */
    private function row(callable $resolve): array
    {
        $row = [];
        foreach (PermissionAction::cases() as $action) {
            $row[$action->value] = $resolve($action);
        }

        return $row;
    }
}
