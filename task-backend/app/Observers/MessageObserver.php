<?php

namespace App\Observers;

use App\Models\Message;
use App\Services\ChatUnread;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

/**
 * Every stored message (internal API from Node, or any future REST send) pushes
 * "chat.unread_changed" to the other members, after the transaction commits,
 * so the counts are read from committed data.
 */
class MessageObserver implements ShouldHandleEventsAfterCommit
{
    public function __construct(private readonly ChatUnread $unread) {}

    public function created(Message $message): void
    {
        $this->unread->publishNewMessage($message);
    }
}
