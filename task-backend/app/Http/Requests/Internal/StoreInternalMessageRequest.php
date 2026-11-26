<?php

namespace App\Http\Requests\Internal;

use App\Models\Message;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Body sent by the Node.js service: { "conversationId": 10, "senderId": 25, "message": "Hello" }.
 * senderId comes from the JWT Node verified; it is trusted only because the
 * request carries the service token (EnsureServiceToken).
 */
class StoreInternalMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // EnsureServiceToken middleware authenticates the caller
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'conversationId' => ['required', 'integer', 'min:1'],
            'senderId' => ['required', 'integer', 'min:1'],
            // TrimStrings + ConvertEmptyStringsToNull run first, so "   " fails "required".
            'message' => ['required', 'string', 'max:'.Message::MAX_LENGTH],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $routeId = (int) $this->route('conversation')->id;

                if ($this->filled('conversationId') && (int) $this->input('conversationId') !== $routeId) {
                    $validator->errors()->add('conversationId', 'The conversationId must match the conversation in the URL.');
                }
            },
        ];
    }
}
