<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PermissionAction;
use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;

class ModuleController extends Controller
{
    /** GET /api/v1/modules — the rows and columns of the permission matrix. */
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'data' => Module::query()->orderBy('id')->get(['id', 'key', 'name', 'description']),
            'meta' => ['actions' => PermissionAction::values()],
        ]);
    }
}
