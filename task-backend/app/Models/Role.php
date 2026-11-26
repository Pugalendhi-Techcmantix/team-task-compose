<?php

namespace App\Models;

use Database\Factories\RoleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    /** @use HasFactory<RoleFactory> */
    use HasFactory;

    public const SUPER_ADMIN = 'super_admin';

    public const USER = 'user';

    /** @var list<string> */
    protected $fillable = ['name', 'slug', 'description'];

    /** @var array<string, mixed> */
    protected $attributes = ['is_system' => false];

    protected function casts(): array
    {
        return ['is_system' => 'boolean'];
    }

    public function isSuperAdmin(): bool
    {
        return $this->slug === self::SUPER_ADMIN;
    }

    /** @return HasMany<User, $this> */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /** @return HasMany<RolePermission, $this> */
    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    public static function idFor(string $slug): int
    {
        return (int) static::query()->where('slug', $slug)->valueOrFail('id');
    }
}
