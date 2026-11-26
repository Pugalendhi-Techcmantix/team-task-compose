<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Role\StoreRoleRequest;
use App\Http\Requests\Role\UpdateRoleRequest;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use App\Models\User;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/** Role management. Any logged-in user (permission checks removed by team decision). */
class RoleController extends Controller
{
    public function __construct(private readonly AccessControlService $access) {}

    /** GET /api/v1/roles */
    public function index(): AnonymousResourceCollection
    {
        return RoleResource::collection(
            Role::query()->with('permissions')->withCount('users')->orderBy('id')->get()
        );
    }

    /**
     * GET /api/v1/roles/options — lightweight list for dropdowns (id, name, slug only).
     * Any logged-in user may call it: no permission check, by team decision.
     * `assignable` is always true while permission checks are removed (any user may assign any role).
     */
    public function options(): JsonResponse
    {
        return response()->json([
            'data' => Role::query()->orderBy('id')->get(['id', 'name', 'slug'])->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'assignable' => true,
            ]),
        ]);
    }

    /** POST /api/v1/roles */
    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = DB::transaction(function () use ($request) {
            $role = Role::query()->create([
                'name' => trim($request->validated('name')),
                'slug' => $request->slug(),
                'description' => $request->validated('description'),
            ]);

            $this->access->syncRolePermissions($role, $request->validated('permissions', []), $this->actor(), allModules: true);

            return $role;
        });

        return (new RoleResource($role->load('permissions')->loadCount('users')))
            ->additional(['message' => 'Role created successfully.'])
            ->response()
            ->setStatusCode(Response::HTTP_CREATED)
            ->header('Location', route('roles.show', $role));
    }

    /** GET /api/v1/roles/{role} */
    public function show(Role $role): RoleResource
    {
        return new RoleResource($role->load('permissions')->loadCount('users'));
    }

    /** PATCH /api/v1/roles/{role} */
    public function update(UpdateRoleRequest $request, Role $role): RoleResource
    {
        if ($role->isSuperAdmin() && $request->has('permissions')) {
            throw new ConflictHttpException('The Super Admin role always has every permission and cannot be changed.');
        }

        DB::transaction(function () use ($request, $role) {
            $data = $request->safe()->only(['description']);

            // System role slugs are referenced in code, so only the display name changes.
            if ($request->has('name')) {
                $data['name'] = trim($request->validated('name'));
                if (! $role->is_system) {
                    $data['slug'] = $request->slug();
                }
            }

            $role->update($data);

            if ($request->has('permissions')) {
                $this->access->syncRolePermissions($role, $request->validated('permissions'), $this->actor());
            }
        });

        return (new RoleResource($role->refresh()->load('permissions')->loadCount('users')))
            ->additional(['message' => 'Role updated successfully.']);
    }

    /** DELETE /api/v1/roles/{role} */
    public function destroy(Role $role): Response
    {
        if ($role->is_system) {
            throw new ConflictHttpException('System roles cannot be deleted.');
        }

        // Includes deactivated and soft-deleted users: the foreign key still points at the role.
        $assigned = User::withTrashed()->where('role_id', $role->id)->count();
        if ($assigned > 0) {
            throw new ConflictHttpException("This role is assigned to {$assigned} user(s). Move them to another role first.");
        }

        $role->delete();

        return response()->noContent();
    }

    private function actor(): User
    {
        return request()->user();
    }
}
