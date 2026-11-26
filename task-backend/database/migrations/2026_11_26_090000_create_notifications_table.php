<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel database notifications (same columns as `php artisan notifications:table`),
 * with PostgreSQL types: jsonb data, timestamptz, and an index for the unread-count query.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');                 // e.g. task.assigned
            $table->morphs('notifiable');           // the user who receives it
            $table->jsonb('data');                  // { type, title, message, taskId }
            $table->timestampTz('read_at')->nullable();
            $table->timestampsTz();

            $table->index(['notifiable_type', 'notifiable_id', 'created_at']); // list, newest first
        });

        // Unread badge count: only unread rows are indexed, so the count stays fast as history grows.
        DB::statement(
            'CREATE INDEX notifications_unread_index ON notifications (notifiable_type, notifiable_id) WHERE read_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
