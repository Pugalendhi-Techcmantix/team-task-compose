# Node.js Realtime Service ↔ Laravel — Integration Guide

**For Dev 3 (Node.js / Socket.IO).** Everything the Laravel side provides, and the rules between the two services.
Full REST reference: [API.md](API.md).

```
React ── POST /api/v1/realtime/token ──▶ Laravel        (15-min JWT for the socket)
React ── Socket.IO (auth.token = JWT) ──▶ Node.js       (Node verifies the JWT itself, HS256)
Node  ── /api/v1/internal/* (service token) ──▶ Laravel (chat: membership check, save message)
Laravel ── PUBLISH taskflow:tasks ──▶ Redis ──▶ Node.js ──▶ React   (task events)
```

## 1. Rules

| Do | Don't |
|---|---|
| Verify the socket JWT locally (HS256, `REALTIME_TOKEN_SECRET`) | Connect to PostgreSQL. Laravel owns all data |
| Save chat messages via `POST /internal/.../messages`, then broadcast | Broadcast a chat message before Laravel returned 201 |
| Subscribe to `taskflow:tasks` with a dedicated Redis client | Publish to Redis (your user can't, by design) |
| Keep both secrets in Node's `.env` | Put secrets in git, logs or chat |

## 2. Connection details and secrets

| What | From your laptop (same Wi-Fi as Dev 2) | Inside Docker (`taskflow_network`) |
|---|---|---|
| Laravel API | `http://192.168.1.37:8000/api/v1` | `http://laravel:8000/api/v1` |
| Redis | `192.168.1.37:6379`, user `taskflow_node` | `redis:6379`, user `taskflow_node` |
| Redis channel | `taskflow:tasks` | same |
| PostgreSQL | **no access, by design** | no access |

Three secrets, **shared privately by Dev 2** (never in git or chat):

| Your env var (Node) | Laravel env var | Used for |
|---|---|---|
| `REALTIME_TOKEN_SECRET` | `REALTIME_TOKEN_SECRET` (same value) | Verifying the socket JWT (HS256) |
| `LARAVEL_SERVICE_TOKEN` | `INTERNAL_SERVICE_TOKEN` (same value) | `Authorization: Bearer …` on `/api/v1/internal/*` |
| Redis password in `REDIS_URL` | `REDIS_NODE_PASSWORD` | Redis user `taskflow_node` |

```env
PORT=3000
LARAVEL_API_URL=http://192.168.1.37:8000/api/v1
LARAVEL_SERVICE_TOKEN=<from Dev 2>
REALTIME_TOKEN_SECRET=<from Dev 2>
REDIS_URL=redis://taskflow_node:<from Dev 2>@192.168.1.37:6379
REDIS_EVENTS_CHANNEL=taskflow:tasks
CORS_ORIGIN=http://192.168.1.64:5174
```

The `taskflow_node` Redis user is **subscribe-only on `taskflow:tasks`**. No keys (sessions and cache stay private), no `PUBLISH`, no other channels (`NOPERM`).

## 3. Socket authentication: the realtime JWT

**React** asks Laravel for a token (cookie or Bearer login both work), then connects:
```js
const { data } = await api.post('/realtime/token');      // { token, expires_at }
const socket = io({ auth: { token: data.data.token } });
```
Response of `POST /api/v1/realtime/token`:
```json
{ "data": { "token": "eyJ0eXAiOiJKV1Qi…", "expires_at": "2026-11-26T10:34:08+00:00" } }
```
JWT claims (HS256):
```json
{ "sub": "25", "iss": "taskflow", "aud": "realtime-service", "iat": 1764151148, "exp": 1764152048 }
```

**Node** verifies it locally, with no HTTP call:
```js
import jwt from 'jsonwebtoken';

io.use((socket, next) => {
  try {
    const claims = jwt.verify(socket.handshake.auth?.token, process.env.REALTIME_TOKEN_SECRET, {
      algorithms: ['HS256'], issuer: 'taskflow', audience: 'realtime-service',
    });
    socket.data.userId = Number(claims.sub);
    socket.join(`user:${claims.sub}`);
    next();
  } catch {
    next(new Error('unauthenticated'));                    // missing / bad / expired → React fetches a new token
  }
});
```
The token lives 15 minutes and is only checked at handshake time. On reconnect, React must fetch a fresh one (`socket.auth = { token }` before `socket.connect()`).

## 4. Chat: internal endpoints (Laravel stores, Node delivers)

Every call carries `Authorization: Bearer <LARAVEL_SERVICE_TOKEN>` and `Accept: application/json`. A missing or wrong token returns **401** `invalid_service_token`. These routes have their own rate limit (6000/min), separate from user limits.

### Membership check
`GET /api/v1/internal/conversations/{conversationId}/members/{userId}`

| Status | Body |
|---|---|
| 200 | `{ "data": { "conversationId": 2, "userId": 2, "isMember": true } }` |
| 404 | `{ "error": { "code": "not_a_member", … } }`, or `not_found` if the conversation or user doesn't exist |
| 403 | `{ "error": { "code": "account_inactive", … } }`: the user was deactivated |

### Save a message
`POST /api/v1/internal/conversations/{conversationId}/messages`
```json
{ "conversationId": 10, "senderId": 25, "message": "Hello" }
```
| Status | Meaning |
|---|---|
| 201 | `{ "data": { "id": 555, "createdAt": "2026-11-26T10:19:08+00:00" } }`. Now broadcast it |
| 403 | `not_a_member` (sender isn't in the conversation, or doesn't exist) / `account_inactive` |
| 422 | validation: `message` required, 1–5000 chars after trimming; `conversationId` must match the URL; `senderId` must be an integer |

`senderId` must come from the **verified JWT** (`claims.sub`), never from the client payload. Laravel trusts it only because the call carries the service token.

Suggested flow:
```js
socket.on('chat:send', async ({ conversationId, message }, ack) => {
  const res = await fetch(`${LARAVEL_API_URL}/internal/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LARAVEL_SERVICE_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, senderId: socket.data.userId, message }),
  });
  const body = await res.json();
  if (res.status !== 201) return ack?.({ ok: false, error: body.error });
  io.to(`conversation:${conversationId}`).emit('chat:message', {
    id: body.data.id, conversationId, senderId: socket.data.userId, message, createdAt: body.data.createdAt,
  });
  ack?.({ ok: true, id: body.data.id });
});
```

**Chat events channel:** not needed right now. Every message goes through the socket, so Laravel doesn't publish chat events. If REST, admin or system messages are added later, Laravel will publish them on a new channel `taskflow:chat` and add it to your Redis user's allowed channels.

**Sample data** (seeded): conversation **1** = group "TaskFlow Team" (users 1, 2, 3); conversation **2** = direct chat Priya (2) ↔ Arun (3).

## 5. Redis events (contract version 1, as in task-node/README.md)

Channel **`taskflow:tasks`**, exactly. Laravel publishes on an unprefixed connection; verified with `PUBLISH` → receivers = 1 (`realtime-service:subscriber`). Published **after** the database commit, synchronously (no queue worker needed).

Every message has **exactly 5 fields**. Optional payload fields are **left out, never `null`**. IDs are positive integers.
```json
{ "eventId": "01a217c6-9002-73d2-bdf3-f6199a1dbeeb", "event": "task.assigned", "version": 1,
  "payload": { "taskId": 13, "assignedTo": 1, "title": "Node contract check", "createdBy": 2, "assignedBy": 2,
               "notificationId": "551f6cd6-9d4c-4489-a627-88b2eb3d7b41", "unreadCount": 1 },
  "occurredAt": "2026-11-26T12:13:38Z" }
```

| event | payload |
|---|---|
| `task.created` | `taskId, title, createdBy, assignedTo?` |
| `task.assigned` | `taskId, assignedTo, title, createdBy, assignedBy` |
| `task.updated` | `taskId, title, assignedTo?, updatedBy` (any other field changed, or unassigned) |
| `task.status_changed` | `taskId, status, previousStatus, title, assignedTo?, changedBy` |
| `notification.count_changed` | `userId, unreadCount` (after mark-read / read-all) |
| `chat.unread_changed` | `userId, conversationId, unreadCount, totalUnread, lastMessage?` → emit to room `user:{userId}` |

- **Notifications:** when Laravel stores a notification for the assignee, that event also carries `notificationId` (UUID) and `unreadCount` (including this one). It's one notification per task save, attached to the most important event (created > assigned > status_changed > updated). There's none for the user's own changes.
- One save can publish several events, in the order assigned → status_changed → updated. Each `eventId` is a unique UUID (v7).
- `task.deleted` is **not** published (it's not in the contract).
- **Chat unread:** after every stored message (your internal `POST …/messages`), one `chat.unread_changed` per member **except the sender**, with `lastMessage: { id, senderId, senderName, message }` (`message` = first 200 characters). After `POST /conversations/{id}/read`, one event for the reader, **without** `lastMessage`. `unreadCount` = this conversation, `totalUnread` = all of that user's chats. Published after commit, so the message is already saved when you get it.
  ```json
  { "eventId": "01a217e4-4fb6-7287-84cd-3e9d3135b29b", "event": "chat.unread_changed", "version": 1,
    "payload": { "userId": 1, "conversationId": 1, "unreadCount": 1, "totalUnread": 1,
                 "lastMessage": { "id": 28, "senderId": 2, "senderName": "Priya Raman", "message": "Unread live check" } },
    "occurredAt": "2026-11-26T12:46:08Z" }
  ```
- **Redis user:** `taskflow_node` may only `SUBSCRIBE taskflow:tasks`. `INFO` (the ioredis ready check) and `PSUBSCRIBE` are refused by design. ioredis copes with the refused `INFO`; use `SUBSCRIBE`, not pattern subscribe.

## 6. Gateway (Nginx)

```nginx
location /api/v1/internal/ { return 404; }     # service-to-service only: never from the browser

location /socket.io/ {
    proxy_pass http://node:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
location /sanctum/ { proxy_pass http://laravel:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
location /api/     { proxy_pass http://laravel:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
```
Inside Docker, Node calls `http://laravel:8000` directly (not through the gateway), so the block doesn't affect it. During Wi-Fi development (Node → `192.168.1.37:8000`), the service token is the protection.

## 7. Testing

```bash
# Membership + save (replace <SERVICE_TOKEN>)
curl -s http://192.168.1.37:8000/api/v1/internal/conversations/2/members/2 \
  -H "Authorization: Bearer <SERVICE_TOKEN>" -H "Accept: application/json"
curl -s -X POST http://192.168.1.37:8000/api/v1/internal/conversations/2/messages \
  -H "Authorization: Bearer <SERVICE_TOKEN>" -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{"conversationId":2,"senderId":2,"message":"Hello"}'

# Watch task events with your own user
redis-cli -h 192.168.1.37 --user taskflow_node --pass '<REDIS_PASSWORD>' SUBSCRIBE taskflow:tasks
```
Seeded logins (password `password`): `admin@taskflow.test` (1), `priya@taskflow.test` (2), `arun@taskflow.test` (3).

## 8. Contract changes

Defined in `app/Services/RedisTaskEventPublisher.php`, `app/Observers/TaskObserver.php` and `app/Http/Controllers/Api/V1/Internal/ConversationController.php`, and covered by tests in `tests/Feature/Tasks/TaskEventPublishingTest.php` and `tests/Feature/Realtime/`. New fields get added; nothing is renamed or removed within `version: 1`.
