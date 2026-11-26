<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permission model:
 *
 *   modules           — the protected areas of the app (tasks, users, …)
 *   role_permissions  — what each role can do per module (view/create/update/delete)
 *   user_permissions  — optional per-user overrides; NULL = inherit the role's value
 *
 * Effective permission = user override (if not NULL) → role permission → false.
 * Super Admin bypasses all checks in code.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('modules', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->string('key', 50);
            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->timestampsTz();

            $table->unique('key');
        });

        DB::statement("ALTER TABLE modules ADD CONSTRAINT modules_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$')");

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnUpdate()->cascadeOnDelete();
            $table->foreignId('module_id')->constrained('modules')->cascadeOnUpdate()->cascadeOnDelete();
            $table->boolean('can_view')->default(false);
            $table->boolean('can_create')->default(false);
            $table->boolean('can_update')->default(false);
            $table->boolean('can_delete')->default(false);
            // Who last changed this row (audit). Kept if that user is removed.
            $table->foreignId('updated_by')->nullable()->constrained('users')->cascadeOnUpdate()->nullOnDelete();
            $table->timestampsTz();

            $table->unique(['role_id', 'module_id']);
            $table->index('module_id');
            $table->index('updated_by');
        });

        Schema::create('user_permissions', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->foreignId('user_id')->constrained('users')->cascadeOnUpdate()->cascadeOnDelete();
            $table->foreignId('module_id')->constrained('modules')->cascadeOnUpdate()->cascadeOnDelete();
            // NULL = no override for that action (use the role's value).
            $table->boolean('can_view')->nullable();
            $table->boolean('can_create')->nullable();
            $table->boolean('can_update')->nullable();
            $table->boolean('can_delete')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->cascadeOnUpdate()->nullOnDelete();
            $table->timestampsTz();

            $table->unique(['user_id', 'module_id']);
            $table->index('module_id');
            $table->index('updated_by');
        });

        // An override row must override something; an all-NULL row is deleted instead.
        DB::statement(
            'ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_not_empty
             CHECK (num_nonnulls(can_view, can_create, can_update, can_delete) > 0)'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('user_permissions');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('modules');
    }
};
