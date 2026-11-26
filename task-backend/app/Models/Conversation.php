<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Conversation extends Model
{
    public const DIRECT = 'direct';

    public const GROUP = 'group';

    /** @var list<string> */
    protected $fillable = ['type', 'title', 'created_by', 'last_message_at'];

    /** @var array<string, mixed> */
    protected $attributes = ['type' => self::DIRECT];

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime', 'created_by' => 'integer'];
    }

    /** @return BelongsToMany<User, $this> */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'conversation_members')->withPivot('joined_at');
    }

    /** @return HasMany<Message, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    /** Newest message, loaded with one subquery for a whole list (no N+1). @return HasOne<Message, $this> */
    public function lastMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany('id');
    }

    /** @param  Builder<Conversation>  $query */
    public function scopeForMember(Builder $query, int $userId): void
    {
        $query->whereHas('members', fn (Builder $q) => $q->whereKey($userId));
    }

    /**
     * Adds "unread_count" for one member: messages after their read pointer that they did not send.
     *
     * @param  Builder<Conversation>  $query
     */
    public function scopeWithUnreadCountFor(Builder $query, int $userId): void
    {
        $query->select('conversations.*')->selectSub(
            Message::query()->selectRaw('count(*)')
                ->whereColumn('messages.conversation_id', 'conversations.id')
                ->where('messages.sender_id', '!=', $userId)
                ->whereRaw(
                    'messages.id > COALESCE((SELECT cm.last_read_message_id FROM conversation_members cm
                     WHERE cm.conversation_id = conversations.id AND cm.user_id = ?), 0)',
                    [$userId],
                ),
            'unread_count',
        );
    }

    /** Display name: the group title, or the other person's name in a direct chat. */
    public function displayNameFor(int $userId): string
    {
        if ($this->type === self::GROUP) {
            return (string) $this->title;
        }

        return $this->members->firstWhere('id', '!=', $userId)?->name ?? 'Direct chat';
    }

    public function hasMember(int $userId): bool
    {
        return $this->members()->whereKey($userId)->exists();
    }
}
