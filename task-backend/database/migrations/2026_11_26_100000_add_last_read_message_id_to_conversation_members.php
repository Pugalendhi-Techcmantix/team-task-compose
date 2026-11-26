<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Chat unread tracking: each member's read pointer.
 * Unread = messages in the conversation with id > last_read_message_id that the member did not send.
 * NULL = nothing read yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_members', function (Blueprint $table) {
            $table->foreignId('last_read_message_id')->nullable()
                ->constrained('messages')->cascadeOnUpdate()->nullOnDelete();
        });

        // Existing chats start "all read", so nobody gets a flood of old history as unread.
        DB::statement(
            'UPDATE conversation_members cm
             SET last_read_message_id = (SELECT max(m.id) FROM messages m WHERE m.conversation_id = cm.conversation_id)'
        );
    }

    public function down(): void
    {
        Schema::table('conversation_members', function (Blueprint $table) {
            $table->dropConstrainedForeignId('last_read_message_id');
        });
    }
};
