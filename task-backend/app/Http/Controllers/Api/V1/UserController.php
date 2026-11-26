<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\User\IndexUserRequest;
use App\Http\Requests\User\StoreUserRequest;
use App\Http\Requests\User\UpdateUserPermissionsRequest;
use App\Http\Requests\User\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AccessControlService;
use App\Support\AuthSession;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class UserController extends Controller
{
    public function __construct(private readonly AccessControlService $access) {}

    /** GET /api/v1/users */
    public function index(IndexUserRequest $request): AnonymousResourceCollection
    {
        $filters = $request->validated();

        $users = User::query()
            ->with('role')
            ->when($filters['search'] ?? null, function (Builder $q, string $term): void {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $w) => $w->whereLike('name', $like)->orWhereLike('email', $like));
            })
            ->when($filters['role_id'] ?? null, fn (Builder $q, int|string $id) => $q->where('role_id', $id))
            ->when(array_key_exists('is_active', $filters), fn (Builder $q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('name')
            ->orderBy('id')
            ->paginate((int) ($filters['per_page'] ?? 15))
            ->withQueryString();

        return UserResource::collection($users);
    }

    /** POST /api/v1/users */
    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::query()->create($request->validated());

        return (new UserResource($user->load('role')))
            ->additional(['message' => 'User created successfully.'])
            ->response()
            ->setStatusCode(Response::HTTP_CREATED)
            ->header('Location', route('users.show', $user));
    }

    /** GET /api/v1/users/{user} */
    public function show(User $user): UserResource
    {
        return new UserResource($user->load('role'));
    }

    /** PATCH /api/v1/users/{user} */
    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $data = $request->validated();
        $actor = $request->user();
        $isSelf = $actor->is($user);

        if (array_key_exists('role_id', $data) && (int) $data['role_id'] !== $user->role_id) {
            if ($isSelf) {
                throw new ConflictHttpException('You cannot change your own role.');
            }
            $this->ensureNotLastSuperAdmin($user, 'change the role of');
        }

        if (array_key_exists('is_active', $data) && ! $data['is_active']) {
            if ($isSelf) {
                throw new ConflictHttpException('You cannot deactivate your own account.');
            }
            $this->ensureNotLastSuperAdmin($user, 'deactivate');
        }

        DB::transaction(function () use ($user, $data, $isSelf, $request) {
            $user->update($data);

            // Deactivation or a password change signs the user out everywhere
            // (except the session making the change, when users change their own password).
            // Browser sessions elsewhere are ended by Sanctum's AuthenticateSession (password hash check).
            if ($user->wasChanged('is_active') && ! $user->is_active) {
                $user->tokens()->delete();
            } elseif ($user->wasChanged('password')) {
                $keepTokenId = $isSelf ? AuthSession::currentTokenId($request) : null;
                $user->tokens()->when($keepTokenId, fn ($q) => $q->whereKeyNot($keepTokenId))->delete();

                if ($isSelf && $keepTokenId === null) {
                    // Keep *this* browser session valid: the session stores the new password hash.
                    Auth::guard('web')->setUser($user);
                }
            }
        });

        return (new UserResource($user->refresh()->load('role')))
            ->additional(['message' => 'User updated successfully.']);
    }

    /** DELETE /api/v1/users/{user} — soft delete; their tasks keep pointing at them. */
    public function destroy(Request $request, User $user): Response
    {
        if ($request->user()->is($user)) {
            throw new ConflictHttpException('You cannot delete your own account.');
        }
        $this->ensureNotLastSuperAdmin($user, 'delete');

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            $user->delete();
        });

        return response()->noContent();
    }

    /** GET /api/v1/users/{user}/permissions — role defaults, overrides and effective permissions. */
    public function permissions(User $user): JsonResponse
    {
        return $this->permissionReport($user);
    }

    /** PUT /api/v1/users/{user}/permissions — set per-user overrides (null = inherit from role). */
    public function updatePermissions(UpdateUserPermissionsRequest $request, User $user): JsonResponse
    {
        if ($user->isSuperAdmin()) {
            throw new ConflictHttpException('A Super Admin always has every permission; overrides are not allowed.');
        }

        DB::transaction(fn () => $this->access->syncUserOverrides($user, $request->validated('permissions'), $request->user()));

        return $this->permissionReport($user, 'User permissions updated successfully.');
    }

    private function permissionReport(User $user, ?string $message = null): JsonResponse
    {
        $user->load('role');

        return response()->json(array_filter([
            'message' => $message,
            'data' => [
                'user' => (new UserResource($user))->resolve(),
                'modules' => $this->access->userPermissionReport($user),
            ],
        ]));
    }

    /** The system must always keep at least one active Super Admin. */
    private function ensureNotLastSuperAdmin(User $user, string $action): void
    {
        if ($user->isSuperAdmin() && User::query()->superAdmins()->where('is_active', true)->count() <= 1) {
            throw new ConflictHttpException("You cannot {$action} the last active Super Admin.");
        }
    }
}
