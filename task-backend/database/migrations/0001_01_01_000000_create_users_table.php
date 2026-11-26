<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Roles + users. Every user has exactly one role (users.role_id → roles.id).
 * Role permissions and per-user overrides live in the permission tables migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->string('name', 50);
            $table->string('slug', 50);
            $table->string('description', 255)->nullable();
            // System roles (super_admin, user) are seeded and cannot be deleted.
            $table->boolean('is_system')->default(false);
            $table->timestampsTz();

            $table->unique('slug');
        });

        DB::statement('CREATE UNIQUE INDEX roles_name_lower_unique ON roles (LOWER(name))');
        DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]*$')");
        DB::statement('ALTER TABLE roles ADD CONSTRAINT roles_name_not_blank CHECK (length(btrim(name)) > 0)');

        Schema::create('users', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->string('name', 100);
            $table->string('email', 255);
            // A role cannot be deleted while users still have it.
            $table->foreignId('role_id')
                ->constrained('roles')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestampTz('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            $table->timestampsTz();
            $table->softDeletesTz();

            $table->index('role_id');
        });

        // Case-insensitive unique email among non-deleted users (a deleted user's email can be reused).
        DB::statement('CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email)) WHERE deleted_at IS NULL');
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_name_not_blank CHECK (length(btrim(name)) > 0)');

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestampTz('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
        Schema::dropIfExists('roles');
    }
};
