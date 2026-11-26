<?php

namespace App\Http\Requests\Role;

use Illuminate\Validation\Validator;

/** Partial update: name, description and/or permissions (only the modules/actions sent change). */
class UpdateRoleRequest extends StoreRoleRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = parent::rules();
        $rules['name'] = ['sometimes', ...array_values(array_filter($rules['name'], fn ($rule) => $rule !== 'required'))];
        $rules['permissions.*.*'] = ['sometimes', 'boolean']; // send only the actions you change

        return $rules;
    }

    public function after(): array
    {
        return [
            ...parent::after(),
            function (Validator $validator): void {
                if (! $this->hasAny(['name', 'description', 'permissions'])) {
                    $validator->errors()->add('body', 'Provide at least one of: name, description, permissions.');
                }
            },
        ];
    }
}
