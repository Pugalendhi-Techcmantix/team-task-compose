<?php

namespace App\Http\Requests\Conversation;

use App\Models\Conversation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Direct: { "type": "direct", "user_id": 3 }
 * Group:  { "type": "group", "title": "Release squad", "member_ids": [2, 3] }   (you are added automatically)
 */
class StoreConversationRequest extends FormRequest
{
    public const MAX_GROUP_MEMBERS = 50;

    public function authorize(): bool
    {
        return true; // any logged-in user
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $activeUser = Rule::exists('users', 'id')->whereNull('deleted_at')->where('is_active', true);

        return [
            'type' => ['required', Rule::in([Conversation::DIRECT, Conversation::GROUP])],
            'user_id' => ['exclude_unless:type,direct', 'required', 'integer', $activeUser],
            'title' => ['exclude_unless:type,group', 'required', 'string', 'min:2', 'max:100'],
            'member_ids' => ['exclude_unless:type,group', 'required', 'array', 'min:1', 'max:'.(self::MAX_GROUP_MEMBERS - 1)],
            'member_ids.*' => ['exclude_unless:type,group', 'integer', 'distinct', $activeUser],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'user_id.exists' => 'The selected user does not exist or is deactivated.',
            'member_ids.*.exists' => 'One of the selected members does not exist or is deactivated.',
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->input('type') === Conversation::DIRECT && (int) $this->input('user_id') === (int) $this->user()->id) {
                    $validator->errors()->add('user_id', 'You cannot start a direct chat with yourself.');
                }
            },
        ];
    }
}
