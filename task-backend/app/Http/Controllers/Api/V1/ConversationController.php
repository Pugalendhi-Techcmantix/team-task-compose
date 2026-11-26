<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Conversation\StoreConversationRequest;
use App\Http\Resources\ConversationResource;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Services\ChatUnread;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Chat for React: list / start conversations and load message history.
 * New messages are SENT through Socket.IO (Node.js saves them via the internal API).
 * Only members can see a conversation (chat privacy; independent of role permissions).
 */
class ConversationController extends Controller
{
    private const MEMBERS = 'members:id,name,email';

    /** GET /api/v1/conversations — my conversations, most recent activity first. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $conversations = Conversation::query()
            ->forMember($request->user()->id)
            ->withUnreadCountFor($request->user()->id)
            ->with([self::MEMBERS, 'lastMessage'])
            ->orderByRaw('last_message_at DESC NULLS LAST')
            ->orderByDesc('id')
            ->paginate((int) ($validated['per_page'] ?? 20))
            ->withQueryString();

        return ConversationResource::collection($conversations);
    }

    /** POST /api/v1/conversations — direct chats are re-used (200), anything new is 201. */
    public function store(StoreConversationRequest $request): JsonResponse
    {
        $me = $request->user()->id;

        [$conversation, $created] = $request->validated('type') === Conversation::DIRECT
            ? $this->findOrCreateDirect($me, (int) $request->validated('user_id'))
            : [$this->createGroup($me, $request->validated('title'), $request->validated('member_ids')), true];

        return (new ConversationResource($conversation->load([self::MEMBERS, 'lastMessage'])))
            ->additional(['message' => $created ? 'Conversation created.' : 'Conversation already exists.'])
            ->response()
            ->setStatusCode($created ? Response::HTTP_CREATED : Response::HTTP_OK)
            ->header('Location', route('conversations.show', $conversation));
    }

    /** GET /api/v1/conversations/{conversation} */
    public function show(Request $request, Conversation $conversation): ConversationResource
    {
        $this->ensureMember($request, $conversation);

        $conversation = Conversation::query()->withUnreadCountFor($request->user()->id)->findOrFail($conversation->id);

        return new ConversationResource($conversation->load([self::MEMBERS, 'lastMessage']));
    }

    /** GET /api/v1/conversations/unread-count — total unread across my conversations (chat badge). */
    public function unreadCount(Request $request, ChatUnread $unread): JsonResponse
    {
        return response()->json(['data' => ['unread_count' => $unread->totalFor($request->user()->id)]]);
    }

    /** POST /api/v1/conversations/{conversation}/read — I've read everything up to the latest message. */
    public function markRead(Request $request, Conversation $conversation, ChatUnread $unread): JsonResponse
    {
        $this->ensureMember($request, $conversation);
        $me = $request->user()->id;

        $unread->markRead($conversation, $me);
        $unread->publishRead($conversation->id, $me); // syncs the badge in my other tabs/devices

        return response()->json(['data' => [
            'conversationId' => $conversation->id,
            'unreadCount' => $unread->perConversation($conversation->id, [$me])[$me],
            'totalUnread' => $unread->totalFor($me),
        ]]);
    }

    /**
     * GET /api/v1/conversations/{conversation}/messages?before_id=&limit=
     * Newest first; load older pages with before_id = meta.nextBeforeId.
     */
    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureMember($request, $conversation);

        $validated = $request->validate([
            'before_id' => ['sometimes', 'integer', 'min:1'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $limit = (int) ($validated['limit'] ?? 30);

        $rows = $conversation->messages()
            ->when($validated['before_id'] ?? null, fn ($q, $beforeId) => $q->where('id', '<', $beforeId))
            ->orderByDesc('id')
            ->limit($limit + 1) // one extra row tells us whether an older page exists
            ->get();

        $hasMore = $rows->count() > $limit;
        $page = $rows->take($limit);

        return response()->json([
            'data' => MessageResource::collection($page)->resolve($request),
            'meta' => [
                'hasMore' => $hasMore,
                'nextBeforeId' => $hasMore ? $page->last()->id : null,
                'limit' => $limit,
            ],
        ]);
    }

    /** @return array{0: Conversation, 1: bool} */
    private function findOrCreateDirect(int $me, int $other): array
    {
        return DB::transaction(function () use ($me, $other) {
            // Serialise concurrent "start chat" clicks for the same pair: never two direct chats for one pair.
            [$a, $b] = [min($me, $other), max($me, $other)];
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ["direct-chat:{$a}:{$b}"]);

            $existing = Conversation::query()
                ->where('type', Conversation::DIRECT)
                ->forMember($a)
                ->forMember($b)
                ->has('members', '=', 2)
                ->first();

            if ($existing) {
                return [$existing, false];
            }

            $conversation = Conversation::query()->create(['type' => Conversation::DIRECT, 'created_by' => $me]);
            $conversation->members()->attach([$a, $b]);

            return [$conversation, true];
        });
    }

    /** @param  list<int>  $memberIds */
    private function createGroup(int $me, string $title, array $memberIds): Conversation
    {
        return DB::transaction(function () use ($me, $title, $memberIds) {
            $conversation = Conversation::query()->create([
                'type' => Conversation::GROUP,
                'title' => trim($title),
                'created_by' => $me,
            ]);
            $conversation->members()->attach(array_values(array_unique([$me, ...array_map('intval', $memberIds)])));

            return $conversation;
        });
    }

    private function ensureMember(Request $request, Conversation $conversation): void
    {
        if (! $conversation->hasMember($request->user()->id)) {
            throw new AccessDeniedHttpException('You are not a member of this conversation.');
        }
    }
}
