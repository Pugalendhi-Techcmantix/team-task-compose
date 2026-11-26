<?php

namespace App\Http\Requests\Concerns;

use App\Enums\PermissionAction;
use App\Models\Module;

/**
 * Validates a permission matrix payload:
 *   { "tasks": { "view": true, "create": true, "update": false, "delete": false }, "users": {...} }
 * Only known module keys and the four actions are accepted.
 */
trait ValidatesPermissionMatrix
{
    /** @return array<string, mixed> */
    protected function permissionMatrixRules(string $field, bool $nullableValues): array
    {
        return [
            $field => ['array:'.implode(',', Module::keys())],
            "{$field}.*" => ['array:'.implode(',', PermissionAction::values())],
            "{$field}.*.*" => $nullableValues ? ['present', 'nullable', 'boolean'] : ['required', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    protected function permissionMatrixMessages(string $field): array
    {
        return [
            "{$field}.array" => 'Unknown module. Allowed modules: '.implode(', ', Module::keys()).'.',
            "{$field}.*.array" => 'Unknown action. Allowed actions: '.implode(', ', PermissionAction::values()).'.',
        ];
    }
}
