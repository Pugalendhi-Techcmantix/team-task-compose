<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\Internal\ConversationController as InternalConversationController;
use App\Http\Controllers\Api\V1\ModuleController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PermissionController;
use App\Http\Controllers\Api\V1\RealtimeTokenController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| TaskFlow API  —  all routes are prefixed with /api (bootstrap/app.php)
|--------------------------------------------------------------------------
| User APIs:     auth:sanctum (session cookie or Bearer token) → active.
|                Permission checks are currently OFF (team decision): any logged-in user.
| Internal APIs: service token only (Node.js realtime service), never via the browser.
*/

// Positive integer ids only: "/tasks/abc" is a 404, never a database type error.
$id = '[1-9][0-9]{0,17}';

Route::get('health', HealthController::class)->name('health');

Route::prefix('v1')->group(function () use ($id) {

    // ---- Public ----
    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:login')
        ->name('auth.login');

    // ---- Logged-in users (React / Postman) ----
    Route::middleware(['auth:sanctum', 'active'])->group(function () use ($id) {
        Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');

        // Short-lived JWT for the Socket.IO handshake (Node.js verifies it).
        Route::post('realtime/token', RealtimeTokenController::class)->name('realtime.token');

        // Notifications (own only). Unread count changes are pushed live via Redis → Node.
        Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount'])->name('notifications.unread-count');
        Route::post('notifications/read-all', [NotificationController::class, 'readAll'])->name('notifications.read-all');
        Route::post('notifications/{id}/read', [NotificationController::class, 'markRead'])
            ->whereUuid('id')->name('notifications.read');

        // Chat (members only). Messages are sent via Socket.IO; REST = list, start, history.
        Route::get('conversations', [ConversationController::class, 'index'])->name('conversations.index');
        Route::post('conversations', [ConversationController::class, 'store'])->name('conversations.store');
        Route::get('conversations/unread-count', [ConversationController::class, 'unreadCount'])->name('conversations.unread-count');
        Route::get('conversations/{conversation}', [ConversationController::class, 'show'])
            ->where('conversation', $id)->name('conversations.show');
        Route::get('conversations/{conversation}/messages', [ConversationController::class, 'messages'])
            ->where('conversation', $id)->name('conversations.messages.index');
        Route::post('conversations/{conversation}/read', [ConversationController::class, 'markRead'])
            ->where('conversation', $id)->name('conversations.read');

        Route::apiResource('tasks', TaskController::class)->where(['task' => $id]);

        Route::apiResource('users', UserController::class)->where(['user' => $id]);
        Route::get('users/{user}/permissions', [UserController::class, 'permissions'])
            ->where('user', $id)->name('users.permissions.show');
        Route::put('users/{user}/permissions', [UserController::class, 'updatePermissions'])
            ->where('user', $id)->name('users.permissions.update');

        Route::get('roles/options', [RoleController::class, 'options'])->name('roles.options');
        Route::apiResource('roles', RoleController::class)->where(['role' => $id]);
        Route::get('modules', ModuleController::class)->name('modules.index');
        Route::get('permissions', PermissionController::class)->name('permissions.index');
    });

    // ---- Internal: Node.js realtime service only (Authorization: Bearer <INTERNAL_SERVICE_TOKEN>) ----
    // Own rate limit (one call per chat message would hit the per-user API limit).
    Route::prefix('internal')
        ->name('internal.')
        ->withoutMiddleware('throttle:api')
        ->middleware(['service.token', 'throttle:internal'])
        ->group(function () use ($id) {
            Route::get('conversations/{conversation}/members/{user}', [InternalConversationController::class, 'member'])
                ->where(['conversation' => $id, 'user' => $id])->name('conversations.members.show');
            Route::post('conversations/{conversation}/messages', [InternalConversationController::class, 'storeMessage'])
                ->where('conversation', $id)->name('conversations.messages.store');
        });
});
