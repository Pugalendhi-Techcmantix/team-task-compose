<?php

namespace App\Models;

use App\Enums\PermissionAction;
use App\Services\PermissionResolver;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    /** @var list<string> */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role_id',
        'is_active',
    ];

    /** @var list<string> */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /** Mirrors the column default so a freshly created model reports it correctly. */
    protected $attributes = ['is_active' => true];

    /** @var array<string, array{view:bool, create:bool, update:bool, delete:bool}>|null */
    protected ?array $permissionMatrix = null;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role_id' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /** Emails are always stored lowercased and trimmed. */
    protected function email(): Attribute
    {
        return Attribute::make(
            set: fn (string $value) => mb_strtolower(trim($value)),
        );
    }

    /** @return BelongsTo<Role, $this> */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /** @return HasMany<UserPermission, $this> */
    public function permissionOverrides(): HasMany
    {
        return $this->hasMany(UserPermission::class);
    }

    /** @return HasMany<Task, $this> */
    public function createdTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'created_by');
    }

    /** @return HasMany<Task, $this> */
    public function assignedTasks(): HasMany
    {
        return $this->hasMany(Task::class, 'assigned_to');
    }

    public function isSuperAdmin(): bool
    {
        return $this->role?->isSuperAdmin() ?? false;
    }

    /**
     * Effective permissions (role + per-user overrides), computed once per request.
     *
     * @return array<string, array{view:bool, create:bool, update:bool, delete:bool}>
     */
    public function permissionMatrix(): array
    {
        return $this->permissionMatrix ??= app(PermissionResolver::class)->matrixFor($this);
    }

    public function hasPermission(string $module, PermissionAction $action): bool
    {
        return $this->permissionMatrix()[$module][$action->value] ?? false;
    }

    public function flushPermissionCache(): void
    {
        $this->permissionMatrix = null;
    }

    /** @param  Builder<User>  $query */
    public function scopeSuperAdmins(Builder $query): void
    {
        $query->whereHas('role', fn (Builder $q) => $q->where('slug', Role::SUPER_ADMIN));
    }
}
