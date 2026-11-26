<?php

namespace App\Http\Requests\User;

use App\Http\Requests\Concerns\ValidatesPermissionMatrix;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Per-user overrides. For each module sent, all four actions are replaced:
 *   true/false = override,  null = inherit from the role.
 * Modules not sent are left unchanged.
 */
class UpdateUserPermissionsRequest extends FormRequest
{
    use ValidatesPermissionMatrix;

    public function authorize(): bool
    {
        return true; // any logged-in user (permission checks removed)
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = $this->permissionMatrixRules('permissions', nullableValues: true);
        $rules['permissions'] = ['required', 'filled', ...$rules['permissions']];

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return $this->permissionMatrixMessages('permissions');
    }
}
