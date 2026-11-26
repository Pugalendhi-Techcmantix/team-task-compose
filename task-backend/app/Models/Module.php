<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A protected area of the application. Rows are seeded (ModuleSeeder). */
class Module extends Model
{
    public const TASKS = 'tasks';

    public const USERS = 'users';

    /** @var list<string> */
    protected $fillable = ['key', 'name', 'description'];

    /** @return list<string> */
    public static function keys(): array
    {
        return static::query()->orderBy('id')->pluck('key')->all();
    }
}
