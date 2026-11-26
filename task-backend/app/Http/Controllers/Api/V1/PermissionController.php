<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PermissionAction;
use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;

class PermissionController extends Controller
{
    /**
     * GET /api/v1/permissions — every permission the backend checks, as a flat list
     * ("tasks.view", "tasks.create", …): each module × each action.
     *
     * Read-only: a permission only means something when backend code checks it,
     * so new ones are added with code (a module + its policy), not through the API.
     */
    public function __invoke(): JsonResponse
    {
        $permissions = Module::query()->orderBy('id')->get()->flatMap(
            fn (Module $module) => collect(PermissionAction::cases())->map(fn (PermissionAction $action) => [
                'key' => "{$module->key}.{$action->value}",
                'module' => $module->key,
                'module_name' => $module->name,
                'action' => $action->value,
                'label' => ucfirst($action->value).' '.strtolower($module->name),
            ])
        )->values();

        return response()->json([
            'data' => $permissions,
            'meta' => [
                'total' => $permissions->count(),
                'modules' => Module::keys(),
                'actions' => PermissionAction::values(),
            ],
        ]);
    }
}
