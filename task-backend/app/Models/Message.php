<?php

namespace App\Models;

use App\Observers\MessageObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[ObservedBy(MessageObserver::class)]
class Message extends Model
{
    public const MAX_LENGTH = 5000;

    /** @var list<string> */
    protected $fillable = ['conversation_id', 'sender_id', 'body'];

    protected function casts(): array
    {
        return ['conversation_id' => 'integer', 'sender_id' => 'integer'];
    }

    /** @return BelongsTo<Conversation, $this> */
    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    /** @return BelongsTo<User, $this> */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id')->withTrashed();
    }
}
