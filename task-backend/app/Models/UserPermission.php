<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Per-user override. A NULL column means "inherit from the role". */
class UserPermission extends Model
{
    /** @var list<string> */
    protected $fillable = ['user_id', 'module_id', 'can_view', 'can_create', 'can_update', 'can_delete', 'updated_by'];

    protected function casts(): array
    {
        // Plain boolean casts keep NULL as NULL.
        return [
            'can_view' => 'boolean',
            'can_create' => 'boolean',
            'can_update' => 'boolean',
            'can_delete' => 'boolean',
        ];
    }

    /** @return BelongsTo<Module, $this> */
    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }
}
