<?php

namespace App\Http\Requests\Task;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Models\Task;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Validates list query parameters so nothing unchecked reaches SQL. */
class IndexTaskRequest extends FormRequest
{
    public const DEFAULT_PER_PAGE = 15;

    public const MAX_PER_PAGE = 100;

    public function authorize(): bool
    {
        return true; // any logged-in user (permission checks removed)
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $sortable = collect(Task::SORTABLE)->flatMap(fn (string $c) => [$c, "-{$c}"])->all();

        return [
            'status' => ['sometimes', Rule::enum(TaskStatus::class)],
            'priority' => ['sometimes', Rule::enum(TaskPriority::class)],
            'assigned_to' => ['sometimes', 'integer', 'min:1'],
            'created_by' => ['sometimes', 'integer', 'min:1'],
            'due_from' => ['sometimes', 'date_format:Y-m-d'],
            'due_to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:due_from'],
            'search' => ['sometimes', 'string', 'max:100'],
            'sort' => ['sometimes', Rule::in($sortable)],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'sort.in' => 'The sort field must be one of: '.implode(', ', Task::SORTABLE).' (prefix with "-" for descending).',
        ];
    }

    public function perPage(): int
    {
        return (int) $this->validated('per_page', self::DEFAULT_PER_PAGE);
    }
}
