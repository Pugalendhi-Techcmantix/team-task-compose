<?php

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // any logged-in user (permission checks removed)
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => [
                'required', 'string', 'email:rfc', 'max:255',
                // Unique among active (non-deleted) users; emails are stored lowercased.
                Rule::unique('users', 'email')->whereNull('deleted_at')->ignore($this->route('user')?->id),
            ],
            'password' => ['required', 'string', 'confirmed', Password::min(8)->letters()->numbers()],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'email.unique' => 'A user with this email already exists.',
            'role_id.exists' => 'The selected role does not exist.',
        ];
    }
}
