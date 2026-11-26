<?php

namespace App\Http\Requests\User;

use Illuminate\Validation\Validator;

/** Partial update: only the fields sent are changed. */
class UpdateUserRequest extends StoreUserRequest
{
    private const FIELDS = ['name', 'email', 'password', 'role_id', 'is_active'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Same rules as create, but every field is optional ("sometimes") instead of "required".
        return collect(parent::rules())
            ->map(fn (array $rules) => ['sometimes', ...array_values(array_filter($rules, fn ($rule) => $rule !== 'required'))])
            ->all();
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->hasAny(self::FIELDS)) {
                    $validator->errors()->add('body', 'Provide at least one of: '.implode(', ', self::FIELDS).'.');
                }
            },
        ];
    }
}
