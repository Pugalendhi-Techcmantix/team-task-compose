<?php

namespace App\Http\Requests\Role;

use App\Http\Requests\Concerns\ValidatesPermissionMatrix;
use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

class StoreRoleRequest extends FormRequest
{
    use ValidatesPermissionMatrix;

    public function authorize(): bool
    {
        return true; // any logged-in user (permission checks removed)
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Starts with a letter so the generated slug matches the roles_slug_format CHECK.
            'name' => ['required', 'string', 'min:2', 'max:50', 'regex:/^[A-Za-z][A-Za-z0-9 _-]*$/'],
            'description' => ['nullable', 'string', 'max:255'],
            ...$this->permissionMatrixRules('permissions', nullableValues: false),
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.regex' => 'The role name must start with a letter and contain only letters, numbers, spaces, "-" or "_".',
            ...$this->permissionMatrixMessages('permissions'),
        ];
    }

    /** Role names (and the slugs derived from them) are unique, case-insensitively. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->filled('name') || $validator->errors()->has('name')) {
                    return;
                }

                $ignoreId = $this->route('role')?->id;

                $exists = Role::query()
                    ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))
                    ->where(fn ($q) => $q
                        ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim((string) $this->input('name')))])
                        ->orWhere('slug', $this->slug()))
                    ->exists();

                if ($exists) {
                    $validator->errors()->add('name', 'A role with this name already exists.');
                }
            },
        ];
    }

    public function slug(): string
    {
        return Str::slug((string) $this->input('name'), '_');
    }
}
