<?php

namespace App\Services;

use App\Enums\PermissionAction;
use App\Models\Module;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Support\Collection;

/** Writes role permissions and per-user overrides, keeping the audit column (updated_by) filled. */
class AccessControlService
{
    /**
     * @param  array<string, array<string, bool>>  $matrix  module key => action => bool
     * @param  bool  $allModules  true on create: modules not sent get an all-false row
     */
    public function syncRolePermissions(Role $role, array $matrix, User $actor, bool $allModules = false): void
    {
        foreach ($this->modules() as $moduleId => $key) {
            if (! $allModules && ! array_key_exists($key, $matrix)) {
                continue;
            }

            $row = RolePermission::query()->firstOrNew(['role_id' => $role->id, 'module_id' => $moduleId]);

            foreach (PermissionAction::cases() as $action) {
                if (array_key_exists($action->value, $matrix[$key] ?? [])) {
                    $row->{$action->column()} = (bool) $matrix[$key][$action->value];
                } elseif (! $row->exists) {
                    $row->{$action->column()} = false;
                }
            }

            $row->updated_by = $actor->id;
            $row->save();
        }
    }

    /**
     * Replaces the overrides of every module sent. NULL = inherit; an all-NULL module row is removed.
     *
     * @param  array<string, array<string, bool|null>>  $matrix
     */
    public function syncUserOverrides(User $user, array $matrix, User $actor): void
    {
        foreach ($this->modules() as $moduleId => $key) {
            if (! array_key_exists($key, $matrix)) {
                continue;
            }

            $values = [];
            foreach (PermissionAction::cases() as $action) {
                $value = $matrix[$key][$action->value] ?? null;
                $values[$action->column()] = $value === null ? null : (bool) $value;
            }

            $match = ['user_id' => $user->id, 'module_id' => $moduleId];

            if (array_filter($values, fn ($v) => $v !== null) === []) {
                UserPermission::query()->where($match)->delete();

                continue;
            }

            UserPermission::query()->updateOrCreate($match, [...$values, 'updated_by' => $actor->id]);
        }

        $user->flushPermissionCache();
    }

    /**
     * Role default, override and effective value for every module — for the admin "user permissions" screen.
     *
     * @return list<array<string, mixed>>
     */
    public function userPermissionReport(User $user): array
    {
        $effective = $user->permissionMatrix();
        $role = RolePermission::query()->where('role_id', $user->role_id)->get()->keyBy('module_id');
        $overrides = UserPermission::query()->where('user_id', $user->id)->get()->keyBy('module_id');

        return $this->modules()->map(fn (string $key, int $moduleId) => [
            'module' => $key,
            'role' => $this->values($role->get($moduleId), default: false),
            'override' => $this->values($overrides->get($moduleId), default: null),
            'effective' => $effective[$key],
        ])->values()->all();
    }

    /** @return Collection<int, string> module id => key */
    private function modules(): Collection
    {
        return Module::query()->orderBy('id')->pluck('key', 'id');
    }

    /** @return array<string, bool|null> */
    private function values(RolePermission|UserPermission|null $row, ?bool $default): array
    {
        $values = [];
        foreach (PermissionAction::cases() as $action) {
            $values[$action->value] = $row?->{$action->column()} ?? $default;
        }

        return $values;
    }
}
