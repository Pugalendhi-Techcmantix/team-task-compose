<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Services\TaskNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/**
 * The logged-in user's notifications. Laravel is the source of truth for the unread
 * count; every change is pushed to all the user's tabs via notification.count_changed.
 */
class NotificationController extends Controller
{
    public function __construct(private readonly TaskNotifier $notifier) {}

    /** GET /api/v1/notifications?unread=1&per_page= — newest first. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'unread' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $user = $request->user();

        $notifications = $user->notifications() // already ordered newest first
            ->when($request->boolean('unread'), fn ($q) => $q->whereNull('read_at'))
            ->paginate((int) ($validated['per_page'] ?? 20))
            ->withQueryString();

        return NotificationResource::collection($notifications)
            ->additional(['meta' => ['unread_count' => $this->notifier->unreadCount($user->id)]]);
    }

    /**
     * GET /api/v1/notifications/unread-count → { "data": { "unread_count": 4, "count": 4 } }
     * ("count" is kept for clients written against the earlier contract).
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $count = $this->notifier->unreadCount($request->user()->id);

        return response()->json(['data' => ['unread_count' => $count, 'count' => $count]]);
    }

    /** POST /api/v1/notifications/{id}/read — idempotent. */
    public function markRead(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $notification = $user->notifications()->whereKey($id)->firstOrFail(); // someone else's id → 404

        $count = DB::transaction(function () use ($notification, $user) {
            if ($notification->read_at !== null) {
                return $this->notifier->unreadCount($user->id); // already read: no event
            }

            $notification->markAsRead();

            return $this->notifier->publishCount($user->id);
        });

        return response()->json([
            'data' => [...(new NotificationResource($notification))->resolve($request), 'unread_count' => $count],
        ]);
    }

    /** POST /api/v1/notifications/read-all */
    public function readAll(Request $request): JsonResponse
    {
        $user = $request->user();

        [$updated, $count] = DB::transaction(function () use ($user) {
            $updated = $user->unreadNotifications()->update(['read_at' => now()]);

            return [$updated, $updated > 0 ? $this->notifier->publishCount($user->id) : 0];
        });

        return response()->json(['data' => ['updated' => $updated, 'unread_count' => $count]]);
    }
}
