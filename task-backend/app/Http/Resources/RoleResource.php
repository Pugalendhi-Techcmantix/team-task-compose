<?php

namespace App\Http\Resources;

use App\Enums\PermissionAction;
use App\Models\Module;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Role */
class RoleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'is_system' => $this->is_system,
            'is_super_admin' => $this->isSuperAdmin(),
            'users_count' => $this->whenCounted('users'),
            'permissions' => $this->whenLoaded('permissions', fn () => $this->matrix()),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /** @return array<string, array<string, bool>> every module, false when no row exists */
    private function matrix(): array
    {
        $rows = $this->permissions->keyBy('module_id');
        $matrix = [];

        foreach (Module::query()->orderBy('id')->pluck('key', 'id') as $moduleId => $key) {
            foreach (PermissionAction::cases() as $action) {
                $matrix[$key][$action->value] = $this->isSuperAdmin()
                    || (bool) $rows->get($moduleId)?->{$action->column()};
            }
        }

        return $matrix;
    }
}
