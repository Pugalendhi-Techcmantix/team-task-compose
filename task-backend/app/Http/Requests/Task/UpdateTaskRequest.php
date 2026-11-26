<?php

namespace App\Http\Requests\Task;

use App\Models\Task;
use Illuminate\Validation\Validator;

/**
 * PUT and PATCH both apply partial updates: only the fields sent are changed,
 * and every field that is sent is fully validated.
 */
class UpdateTaskRequest extends StoreTaskRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = parent::rules();

        $rules['title'] = ['sometimes', 'required', 'string', 'min:3', 'max:255'];

        // An existing overdue date may be kept; only a *changed* date must not be in the past.
        /** @var Task $task */
        $task = $this->route('task');
        if ($this->input('due_date') === $task->due_date?->format('Y-m-d')) {
            $rules['due_date'] = ['nullable', 'date_format:Y-m-d'];
        }

        return $rules;
    }

    /** An update with none of the known fields is a client mistake, not a silent no-op. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $fields = array_keys(parent::rules());

                if (array_intersect($fields, array_keys($this->all())) === []) {
                    $validator->errors()->add('body', 'Provide at least one of: '.implode(', ', $fields).'.');
                }
            },
        ];
    }
}
