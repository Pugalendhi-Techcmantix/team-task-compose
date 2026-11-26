<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Chat storage. Laravel owns the data; the Node.js realtime service only
 * delivers messages live and saves them through the internal API.
 *
 *   conversations ──< conversation_members >── users
 *   conversations ──< messages (sender_id → users)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->enum('type', ['direct', 'group'])->default('direct');
            $table->string('title', 100)->nullable(); // groups only
            $table->foreignId('created_by')->nullable()->constrained('users')->cascadeOnUpdate()->nullOnDelete();
            // Denormalised for "most recent chats first" lists; updated with every new message.
            $table->timestampTz('last_message_at')->nullable();
            $table->timestampsTz();

            $table->index('created_by');
            $table->index('last_message_at');
        });

        DB::statement(
            "ALTER TABLE conversations ADD CONSTRAINT conversations_group_has_title
             CHECK (type = 'direct' OR (title IS NOT NULL AND length(btrim(title)) > 0))"
        );

        Schema::create('conversation_members', function (Blueprint $table) {
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnUpdate()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnUpdate()->cascadeOnDelete();
            $table->timestampTz('joined_at')->useCurrent();

            $table->primary(['conversation_id', 'user_id']); // a user is a member at most once
            $table->index('user_id');                        // "conversations of user X"
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id()->generatedAs()->always();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnUpdate()->cascadeOnDelete();
            // Users are soft-deleted, so history keeps its sender.
            $table->foreignId('sender_id')->constrained('users')->cascadeOnUpdate()->restrictOnDelete();
            $table->text('body');
            $table->timestampsTz();

            $table->index(['conversation_id', 'id']); // history pagination: newest first per conversation
            $table->index('sender_id');
        });

        DB::statement(
            'ALTER TABLE messages ADD CONSTRAINT messages_body_valid
             CHECK (length(btrim(body)) > 0 AND char_length(body) <= 5000)'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversation_members');
        Schema::dropIfExists('conversations');
    }
};
