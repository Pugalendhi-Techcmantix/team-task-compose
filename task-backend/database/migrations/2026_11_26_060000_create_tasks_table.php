<?php

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id()->generatedAs()->always(); // BIGINT GENERATED ALWAYS AS IDENTITY on PostgreSQL
            $table->string('title', 255);
            $table->text('description')->nullable();
            // varchar + CHECK constraint, validated again in PHP via backed enums
            $table->enum('status', TaskStatus::values())->default(TaskStatus::Todo->value);
            $table->enum('priority', TaskPriority::values())->default(TaskPriority::Medium->value);
            $table->date('due_date')->nullable();
            $table->timestampTz('completed_at')->nullable();

            // A creator can't be deleted while they still own tasks (keeps history intact).
            $table->foreignId('created_by')
                ->constrained('users')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            // If the assignee is deleted, the task simply becomes unassigned.
            $table->foreignId('assigned_to')
                ->nullable()
                ->constrained('users')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            $table->timestampsTz();
            $table->softDeletesTz();

            // PostgreSQL does not index FK columns automatically: index every access path we query.
            $table->index('created_by');
            $table->index(['assigned_to', 'status']);
            $table->index('status');
            $table->index('due_date');
            $table->index('created_at');
        });

        if (DB::getDriverName() === 'pgsql') {
            // Data-integrity rules enforced by the database, not only by the API.
            DB::statement('ALTER TABLE tasks ADD CONSTRAINT tasks_title_not_blank CHECK (length(btrim(title)) > 0)');
            DB::statement(
                "ALTER TABLE tasks ADD CONSTRAINT tasks_completed_at_matches_status
                 CHECK ((status = 'done') = (completed_at IS NOT NULL))"
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
