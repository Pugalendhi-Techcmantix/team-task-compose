# Realtime Service

Node.js + TypeScript service that delivers real-time features for TaskFlow over Socket.IO:

- authenticated Socket.IO connections (credential issued by Laravel)
- per-user rooms (`user:{id}`) for notifications to every tab/device of a user
- conversation rooms (`conversation:{id}`) for chat and typing indicators
- presence (online/offline, multi-socket aware)
- task notifications driven by events Laravel publishes to Redis

**Out of scope, by design:** users, tasks, conversations, message storage, PostgreSQL, login and any second authentication system. Laravel owns all of these; React owns the UI. This service keeps no permanent data. It holds live socket state only.

---

## Architecture

```text
React ──Socket.IO──►  Node realtime-service  ◄──Redis SUBSCRIBE──  Redis  ◄──PUBLISH──  Laravel ──► PostgreSQL
                         │
                         ├─ socket.auth        verifies the Laravel-issued credential → socket.data.userId
                         ├─ socket.handlers    transport only: rate limits, validation errors, acks
                         ├─ services/          ChatService · NotificationService · PresenceService
                         ├─ events/            envelope schema · registry (event@version) · parser · router · dedupe
                         └─ redis/             dedicated subscriber connection, reconnect + resubscribe
```

Task notification flow:

```text
Laravel saves task → PUBLISH task.events → RedisSubscriber → EventRouter (parse + Zod + dedupe)
  → task.events handler (versioned payload → TaskNotificationInput) → NotificationService
  → io.to("user:{assignedTo}").emit("notification") → every socket of that user
```

Chat flow (Laravel stores, Node delivers live):

```text
React ─conversation:join {10}─► Node ─GET  {LARAVEL_API_URL}/internal/conversations/10/members/25─► Laravel
                                     ◄── 200 member / 403·404 not a member (errors → deny) ──────────┘
React ─chat:send {10,"Hi"}────► Node ─POST {LARAVEL_API_URL}/internal/conversations/10/messages──► Laravel ─► PostgreSQL
                                     ◄── 201 { id, createdAt } ──────────────────────────────────────┘
                                Node ─chat:message { id, conversationId, senderId: 25, message, createdAt }─► conversation:10
```

- `senderId` always comes from the verified token. Laravel trusts it because the call carries `LARAVEL_SERVICE_TOKEN`.
- Nothing is broadcast unless Laravel confirms the message was saved.
- Laravel re-checks membership when storing, so a user removed from a conversation can't keep sending.
- Typing and presence stay inside Node and are never stored.

### Source layout

| Path                                      | Responsibility                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `src/server.ts`                           | Entry point: config, logger, signals, graceful shutdown                        |
| `src/container.ts`                        | Composition root: wires every module; adapters are injectable                  |
| `src/app.ts`, `src/http/*`                | Express app, `/health`, `/ready`                                               |
| `src/config/env.ts`                       | Zod validation of environment; startup fails with a list of problems           |
| `src/socket/socket.auth.ts`               | `RealtimeAuthenticator` interface + JWT implementation + handshake middleware  |
| `src/socket/socket.handlers.ts`           | Binds client events to services; acks, `chat:error`, rate limits, token expiry |
| `src/socket/socket.emitter.ts`            | `RealtimeEmitter`: the only way services push to clients                       |
| `src/socket/socket.schemas.ts`            | Zod schemas for client payloads                                                |
| `src/events/*`                            | Event names, envelope schema, registry, parser, router, deduplicator, handlers |
| `src/services/chat.service.ts`            | Join/leave, send, typing                                                       |
| `src/services/notification.service.ts`    | Builds and targets notifications                                               |
| `src/services/presence.service.ts`        | `PresenceStore` interface + in-memory store, online/offline events             |
| `src/services/conversation.authorizer.ts` | Conversation membership boundary (Laravel integration point)                   |
| `src/integrations/laravel/*`              | Laravel internal API client, membership authorizer, message persistence        |
| `src/services/message.persistence.ts`     | Message persistence boundary (Laravel integration point)                       |
| `src/redis/*`                             | Connection factory, subscriber (reconnect/resubscribe), publisher (dev/test)   |
| `src/utils/*`                             | Logger (with redaction), structured errors, rate limiter, validation helper    |

---

## Installation and development

Requirements: Node.js ≥ 20.11 (Node 24 used in Docker) and a reachable Redis.

```bash
npm install
cp .env.example .env        # then set REALTIME_TOKEN_SECRET (>= 32 chars, shared with Laravel)
npm run dev                 # tsx watch, pretty logs when attached to a TTY
```

To try chat locally without Laravel, set `CONVERSATION_AUTHORIZATION_MODE=allow-all-dev` (refused when `NODE_ENV=production`).

Local Redis, if you don't already have one:

```bash
docker run -d --name realtime-redis -p 6379:6379 redis:7-alpine
```

### Scripts

| Script                 | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Run from source with reload             |
| `npm run build`        | Compile `src/` to `dist/`               |
| `npm start`            | Run the compiled service                |
| `npm test`             | Unit + integration tests (needs Redis)  |
| `npm run test:watch`   | Vitest watch mode                       |
| `npm run lint`         | ESLint                                  |
| `npm run format`       | Prettier write                          |
| `npm run format:check` | Prettier check                          |
| `npm run typecheck`    | `tsc --noEmit` over `src/` and `tests/` |

---

## Environment variables

Validated with Zod at startup; any problem stops the process with a list of every invalid variable (values are never printed).

| Variable                             | Required      | Default                                                     | Notes                                                                        |
| ------------------------------------ | ------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                           |               | `development`                                               | `development` \| `test` \| `production`                                      |
| `PORT` / `HOST`                      |               | `3000`/`0.0.0.0`                                            |                                                                              |
| `CORS_ORIGIN`                        | yes           |                                                             | Comma-separated origins (`scheme://host[:port]`). `*` rejected in production |
| `REDIS_HOST`                         | yes           |                                                             |                                                                              |
| `REDIS_PORT`                         |               | `6379`                                                      |                                                                              |
| `REDIS_USERNAME` / `REDIS_PASSWORD`  |               | empty                                                       | ACL credentials                                                              |
| `REDIS_TLS`                          |               | `false`                                                     | `true` enables TLS                                                           |
| `REDIS_DB`                           |               | `0`                                                         | Pub/sub ignores the DB index; kept for completeness                          |
| `REDIS_RECONNECT_MAX_DELAY_MS`       |               | `5000`                                                      | Reconnect backoff cap (retries forever)                                      |
| `REDIS_TASK_CHANNEL`                 |               | `task.events`                                               |                                                                              |
| `REDIS_CHAT_CHANNEL`                 |               | `chat.events`                                               | Must differ from the task channel; set empty to disable                      |
| `REALTIME_TOKEN_ALGORITHM`           |               | `HS256`                                                     | `HS256/384/512`, `RS256/384/512`, `ES256/384/512`                            |
| `REALTIME_TOKEN_SECRET`              | HS\*          |                                                             | ≥ 32 characters                                                              |
| `REALTIME_TOKEN_PUBLIC_KEY`          | RS\*/ES\*     |                                                             | PEM; `\n` escapes accepted                                                   |
| `REALTIME_TOKEN_ISSUER`              | yes           |                                                             | Must equal the token `iss`                                                   |
| `REALTIME_TOKEN_AUDIENCE`            | yes           |                                                             | Must be in the token `aud`                                                   |
| `REALTIME_TOKEN_USER_CLAIM`          |               | `sub`                                                       | Claim holding the user ID                                                    |
| `REALTIME_TOKEN_CLOCK_TOLERANCE_SEC` |               | `5`                                                         |                                                                              |
| `LARAVEL_API_URL`                    |               |                                                             | Laravel internal API base, e.g. `http://laravel:8000/api/v1`                 |
| `LARAVEL_SERVICE_TOKEN`              | laravel modes |                                                             | ≥ 32 chars; sent as `Authorization: Bearer`                                  |
| `LARAVEL_API_TIMEOUT_MS`             |               | `3000`                                                      |                                                                              |
| `LARAVEL_MEMBERSHIP_PATH`            |               | `/internal/conversations/{conversationId}/members/{userId}` |                                                                              |
| `LARAVEL_MESSAGES_PATH`              |               | `/internal/conversations/{conversationId}/messages`         |                                                                              |
| `CONVERSATION_AUTHORIZATION_MODE`    |               | `laravel` if URL set, else `deny-all`                       | `laravel` \| `deny-all` \| `allow-all-dev` (dev only)                        |
| `MESSAGE_PERSISTENCE_MODE`           |               | `laravel` if URL set, else `realtime-only`                  | `laravel` \| `realtime-only`                                                 |
| `CHAT_MAX_MESSAGE_LENGTH`            |               | `2000`                                                      | Characters, after trimming                                                   |
| `SOCKET_MAX_PAYLOAD_BYTES`           |               | `16384`                                                     | Socket.IO `maxHttpBufferSize`; larger packets drop the connection            |
| `EVENT_DEDUPE_TTL_MS`                |               | `600000`                                                    | How long processed `eventId`s are remembered                                 |
| `RATE_LIMIT_WINDOW_MS`               |               | `10000`                                                     | Window for the limits below (per user, per process)                          |
| `RATE_LIMIT_CHAT_SEND`               |               | `20`                                                        |                                                                              |
| `RATE_LIMIT_TYPING`                  |               | `30`                                                        | `typing:start` + `typing:stop` combined                                      |
| `RATE_LIMIT_CONVERSATION_JOIN`       |               | `30`                                                        |                                                                              |
| `SHUTDOWN_TIMEOUT_MS`                |               | `10000`                                                     | Forced exit if graceful shutdown takes longer                                |
| `LOG_LEVEL`                          |               | `info`                                                      | `fatal`…`trace`, `silent`                                                    |

`.env` is git-ignored and Docker-ignored. In production, pass configuration as environment variables or orchestrator secrets.

---

## HTTP endpoints

| Endpoint      | 200                                       | 503                                                                                                 |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /health` | `{"status":"ok"}`: the process is serving | never                                                                                               |
| `GET /ready`  | `{"status":"ready","redis":"connected"}`  | `{"status":"not_ready","redis":"disconnected"}` while Redis is down/unsubscribed or during shutdown |

Use `/health` for liveness and `/ready` for load-balancer readiness.

---

## Authentication contract

1. The user logs in to Laravel (Laravel owns sessions).
2. React asks Laravel for a short-lived **realtime credential** (JWT).
3. React connects: `io(URL, { auth: { token } })` (an `Authorization: Bearer <token>` header is also accepted).
4. Node verifies signature (only the configured algorithm), `exp` (required), `iss`, `aud` and the user claim (`sub` by default, a positive integer or numeric string).
5. The user ID is stored in `socket.data.userId`. **Client-provided user IDs are never read**, not in the handshake and not in any event payload.
6. When the credential expires, the socket is disconnected; the client fetches a new token and reconnects.

Example claims Laravel should sign:

```json
{ "sub": "25", "iss": "taskflow", "aud": "realtime-service", "iat": 1795694400, "exp": 1795695300 }
```

Rejected handshakes produce a client `connect_error` whose `data` is `{ code, message }` with `code` ∈ `UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`.

Another credential type (e.g. token introspection against Laravel) can be supported by implementing `RealtimeAuthenticator` in `src/socket/socket.auth.ts` and passing it to `createRealtimeService`. No Socket.IO code changes.

---

## Redis event contract

Laravel publishes JSON to the configured channels. Every message uses this envelope:

```json
{
  "eventId": "evt_100",
  "event": "task.assigned",
  "version": 1,
  "payload": { "taskId": 101, "assignedTo": 25, "createdBy": 10, "title": "Fix payment bug" },
  "occurredAt": "2026-11-26T10:00:00Z"
}
```

- All five fields are required. `occurredAt` is ISO-8601 with `Z` or an offset. Messages are limited to 64 KB.
- Invalid JSON, invalid envelopes, unknown events, unsupported versions and invalid payloads are **logged (`redis_event_invalid`) and dropped**. They never crash the service.
- `eventId` is remembered for `EVENT_DEDUPE_TTL_MS`; a re-published event is ignored (`redis_event_duplicate`).
- Payload fields not listed below are stripped and never forwarded to clients.

### Task events (`REDIS_TASK_CHANNEL`), version 1

| Event                 | Payload                                                                                 | Notified user        |
| --------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| `task.created`        | `taskId`, `title?`, `createdBy?`, `assignedTo?` (nullable)                              | `assignedTo`, if set |
| `task.assigned`       | `taskId`, `assignedTo` (required), `title?`, `createdBy?`, `assignedBy?`                | `assignedTo`         |
| `task.updated`        | `taskId`, `title?`, `assignedTo?` (nullable), `updatedBy?`                              | `assignedTo`, if set |
| `task.status_changed` | `taskId`, `status`, `previousStatus?`, `title?`, `assignedTo?` (nullable), `changedBy?` | `assignedTo`, if set |

IDs are positive integers (defined once in `src/types/ids.ts`).

Every task event may also include two optional fields when Laravel stores the notification:

| Field            | Effect on the `notification` sent to the user                               |
| ---------------- | --------------------------------------------------------------------------- |
| `notificationId` | becomes `notification.id` (use it for mark-as-read); otherwise `eventId`    |
| `unreadCount`    | copied to `notification.unreadCount` (the recipient's count after this one) |

### Notification events, version 1

`notification.count_changed`: Laravel publishes it whenever a user's unread count changes for any reason other than a new notification (mark read, mark all read, delete). Node forwards it to every tab of that user as `notification:count`. Publish it on `REDIS_TASK_CHANNEL`; any subscribed channel works.

```json
{
  "eventId": "<uuid>",
  "event": "notification.count_changed",
  "version": 1,
  "payload": { "userId": 25, "unreadCount": 3 },
  "occurredAt": "2026-11-26T10:05:00Z"
}
```

### Chat events (`REDIS_CHAT_CHANNEL`), version 1 (proposed)

`chat.message_created`: Laravel announces a message it persisted outside the socket path (e.g. via REST) so Node delivers it live:

```json
{
  "eventId": "evt_900",
  "event": "chat.message_created",
  "version": 1,
  "payload": {
    "messageId": 555,
    "conversationId": 10,
    "senderId": 25,
    "message": "Hi",
    "createdAt": "2026-11-26T10:00:00Z"
  },
  "occurredAt": "2026-11-26T10:00:00Z"
}
```

### Adding a payload version

Add another `defineEvent({ event, version: 2, payloadSchema, handle })` in `src/events/task.events.ts` that maps the v2 payload to `TaskNotificationInput`. v1 keeps working; `NotificationService` doesn't change.

---

## Socket.IO event contract

Every client event accepts an optional acknowledgement callback receiving `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`. Failures are **also** emitted as `chat:error` (`{ code, message, details?, event }`), so clients without acks still see them.

### Client → server

| Event                | Payload                       | Ack `data`                   | Rate limited |
| -------------------- | ----------------------------- | ---------------------------- | ------------ |
| `conversation:join`  | `{ conversationId }`          | `{ conversationId }`         | yes          |
| `conversation:leave` | `{ conversationId }`          | `{ conversationId }`         | no           |
| `chat:send`          | `{ conversationId, message }` | the broadcast `chat:message` | yes          |
| `typing:start`       | `{ conversationId }`          | `{ conversationId }`         | yes          |
| `typing:stop`        | `{ conversationId }`          | `{ conversationId }`         | yes          |

Extra fields such as `senderId` or `userId` are ignored.

### Server → client

| Event                          | Payload                                                         | Target                                        |
| ------------------------------ | --------------------------------------------------------------- | --------------------------------------------- |
| `notification`                 | `{ id, type, title, message, taskId, createdAt, unreadCount? }` | `user:{id}` (all sockets of a user)           |
| `notification:count`           | `{ unreadCount, updatedAt }`                                    | `user:{id}` (all sockets of a user)           |
| `chat:message`                 | `{ id?, conversationId, senderId, message, createdAt }`         | `conversation:{id}` (incl. sender)            |
| `typing:start` / `typing:stop` | `{ conversationId, userId }`                                    | `conversation:{id}` except the sending socket |
| `presence:update`              | `{ userId, status: "online" \| "offline", at }`                 | all connected sockets                         |
| `chat:error`                   | `{ code, message, details?, event }`                            | the offending socket                          |
| `notification:error`           | same shape as `chat:error`                                      | reserved; not emitted yet                     |

Example notification:

```json
{
  "id": "evt_100",
  "type": "task.assigned",
  "title": "New task assigned",
  "message": "Fix payment bug",
  "taskId": 101,
  "createdAt": "2026-11-26T10:00:00Z"
}
```

Example client:

```ts
const socket = io('http://localhost:3000', { auth: { token } });
socket.on('notification', (n) => showToast(n.title, n.message));
socket.on('chat:message', (m) => appendMessage(m));
const res = await socket.emitWithAck('conversation:join', { conversationId: 10 });
if (res.ok) socket.emit('chat:send', { conversationId: 10, message: 'Hello' });
```

### Error codes

`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_PAYLOAD`, `CONVERSATION_ACCESS_DENIED`, `NOT_IN_CONVERSATION`, `MESSAGE_TOO_LARGE`, `MESSAGE_PERSISTENCE_FAILED`, `RATE_LIMITED`, `UNKNOWN_EVENT`, `REDIS_UNAVAILABLE`, `NOT_FOUND`, `INTERNAL_ERROR`. Clients never receive stack traces or internal details.

---

## Chat, typing and presence behaviour

- **Joining** a conversation calls `ConversationAuthorizer.canAccess(userId, conversationId)`. Authorizer errors deny access (fail closed). Sending and typing require having joined.
- **Sending**: the message is trimmed, must be non-empty and ≤ `CHAT_MAX_MESSAGE_LENGTH`. `MessagePersistence.persist()` runs first; if it fails, nothing is broadcast and the sender gets `MESSAGE_PERSISTENCE_FAILED`.
- **Typing** is relayed only, never stored. A disconnecting socket emits `typing:stop` to its conversations.
- **Presence**: `online` on a user's first socket, `offline` after the last socket disconnects. Stored in memory (single node); `PresenceStore` is the seam for a Redis-backed store.

### Adapters

| Boundary                 | `laravel` (default when `LARAVEL_API_URL` is set) | Fallback without Laravel                                                 |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `ConversationAuthorizer` | `LaravelConversationAuthorizer`                   | `deny-all`: every join refused; `allow-all-dev`: anyone joins (dev only) |
| `MessagePersistence`     | `LaravelMessagePersistence`                       | `realtime-only`: delivered live but **not stored** (warning logged)      |

The active adapters are logged at startup (`chat_adapters`). Laravel availability doesn't affect `/ready`: while Laravel is down, joins are denied and sends fail with `MESSAGE_PERSISTENCE_FAILED`, but notifications keep flowing.

---

## Logging

Pino JSON logs with an `event` field: `server_started`, `server_stopped`, `socket_connected`, `socket_disconnected`, `authentication_failed`, `redis_connected`, `redis_disconnected`, `redis_reconnecting`, `redis_subscribed`, `redis_event_received`, `redis_event_invalid`, `redis_event_duplicate`, `notification_sent`, `chat_message_received`, `chat_message_broadcast`, `conversation_joined`, `conversation_access_denied`, `presence_online`, `presence_offline`, …

Metadata is limited to `userId`, `socketId`, `eventType`, `eventId`, `conversationId` and similar. Tokens, secrets and passwords are never logged; known sensitive paths are also redacted as a safety net.

---

## Graceful shutdown

On `SIGINT`/`SIGTERM`: readiness turns `not_ready` → the HTTP server stops accepting connections → Socket.IO disconnects clients and closes → Redis channels are unsubscribed → the Redis connection is closed → the HTTP server finishes closing → exit 0. Redis commands during shutdown are time-boxed, so an unreachable Redis can't stall it. A hard exit happens after `SHUTDOWN_TIMEOUT_MS`.

---

## Testing

```bash
npm test
```

- **Unit** (`tests/unit`): env validation, auth, event parsing/versioning/dedupe, notification mapping, chat service, presence, rate limiting.
- **Socket integration** (`tests/integration/socket.test.ts`): real server + `socket.io-client`; Redis replaced by an in-memory event source. Covers auth (valid/invalid/expired), user rooms, the mandatory user 25/30 scenario, multi-device, conversation rooms, chat delivery, the `senderId` spoofing test, payload limits, rate limits, typing, presence, disconnect and shutdown.
- **Redis integration** (`tests/integration/redis.test.ts`): real Redis. Covers subscription, the mandatory E2E scenario, multi-device, all four task events, invalid events, duplicates, chat channel, an outage with reconnect and resubscribe (simulated with a TCP proxy), and starting while Redis is down.

Redis tests use `REDIS_TEST_HOST`/`REDIS_TEST_PORT` (default `127.0.0.1:6379`) and unique channel names per run, so they are safe to run against a shared development Redis. They fail with a clear message if Redis is unreachable.

Test doubles for Laravel boundaries live only in `tests/helpers/mocks.ts`.

---

## Docker

```bash
docker build -t realtime-service .
docker run --rm -p 3000:3000 \
  -e CORS_ORIGIN=https://app.example.com \
  -e REDIS_HOST=redis -e REDIS_PASSWORD=... \
  -e REALTIME_TOKEN_SECRET=... \
  -e REALTIME_TOKEN_ISSUER=taskflow -e REALTIME_TOKEN_AUDIENCE=realtime-service \
  realtime-service
```

Multi-stage build (TypeScript compiled in the build stage, production dependencies only at runtime), runs as the non-root `node` user, exposes 3000, `HEALTHCHECK` on `/health`, `STOPSIGNAL SIGTERM`. No `.env` is copied into the image. Keep Redis on a private network. Never expose it publicly.

---

## Troubleshooting

| Symptom                                      | Check                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Process exits with `Invalid configuration`   | The listed variables; secrets must be ≥ 32 chars for HS\*                                                           |
| `connect_error` `INVALID_TOKEN`              | Algorithm, secret/public key, `iss`, `aud` and the user claim match Laravel's token; token has `exp`                |
| `connect_error` `TOKEN_EXPIRED`              | Clock skew (`REALTIME_TOKEN_CLOCK_TOLERANCE_SEC`) or the client is reusing an old token                             |
| CORS errors in the browser                   | The exact origin (scheme + host + port) is in `CORS_ORIGIN`                                                         |
| `/ready` returns 503                         | Redis reachability/credentials; logs show `redis_error` / `redis_reconnecting`                                      |
| No notifications                             | Laravel publishes to the same channel names; logs show `redis_event_received` or `redis_event_invalid` with details |
| `CONVERSATION_ACCESS_DENIED` for everyone    | Mode is `deny-all`, or Laravel's membership route returns 404 (route missing or wrong `LARAVEL_MEMBERSHIP_PATH`)    |
| Joins fail with `INTERNAL_ERROR`             | Laravel unreachable, slow (> `LARAVEL_API_TIMEOUT_MS`) or returning 401/5xx; see `laravel_request_failed` logs      |
| Sends fail with `MESSAGE_PERSISTENCE_FAILED` | Laravel message route status/response shape; see `laravel_message_*` logs                                           |
| Client disconnects on a large message        | Packet exceeded `SOCKET_MAX_PAYLOAD_BYTES`                                                                          |

---

## Laravel integration requirements

The following must be agreed with the Laravel team. Everything is configurable; nothing is hard-coded.

### Authentication

- **Credential type:** JWT (another type → implement `RealtimeAuthenticator`)
- **Signing algorithm:** `REALTIME_TOKEN_ALGORITHM`
- **Secret / public key:** `REALTIME_TOKEN_SECRET` or `REALTIME_TOKEN_PUBLIC_KEY` (asymmetric keys are preferable, so Node never holds a signing secret)
- **Issuer / audience:** `REALTIME_TOKEN_ISSUER` / `REALTIME_TOKEN_AUDIENCE`
- **Expiration:** `exp` required; short-lived (e.g. 5–15 min) recommended. Sockets are disconnected at expiry.
- **User ID claim:** `REALTIME_TOKEN_USER_CLAIM`; value must be a positive integer (or numeric string)
- **Issuing endpoint:** Laravel-side, e.g. `POST /api/realtime/token` for the logged-in user

### Redis

- **Connection:** host, port, username, password, TLS (`REDIS_*`)
- **Channels:** `REDIS_TASK_CHANNEL`, `REDIS_CHAT_CHANNEL`. Laravel's Redis key/channel prefix (`database.redis.options.prefix`) affects channel names; publish with the exact names configured here.
- **ACL:** a least-privilege Redis user needs `SUBSCRIBE`/`UNSUBSCRIBE`/`PING` and access to both channels (`&<channel>`). Channels are subscribed one by one, so a refused channel logs `redis_subscribe_failed` (NOPERM) and keeps `/ready` at 503 without blocking the others. `INFO` is not required.

### Task events

- **Event names and version:** the table above, version `1`
- **Event ID:** unique per event (UUID/ULID), stable across re-publishes
- **Payload:** fields as listed; the assignee field is `assignedTo`
- **Timestamp:** `occurredAt` as ISO-8601
- **Publish after commit:** Laravel should publish only after the DB transaction commits

### Internal API for Node (two endpoints)

Both endpoints are relative to `LARAVEL_API_URL`; the paths can be changed with `LARAVEL_MEMBERSHIP_PATH` / `LARAVEL_MESSAGES_PATH`. Every request carries:

```http
Authorization: Bearer <LARAVEL_SERVICE_TOKEN>
Accept: application/json
```

Laravel should accept these routes **only** with that token (e.g. a middleware comparing it with a constant-time check). They are not for browsers. Keep them off the public Nginx routes, or block `/api/v1/internal/*` there.

**1. Membership check:** `GET /internal/conversations/{conversationId}/members/{userId}`

| Laravel replies                                                             | Node does                               |
| --------------------------------------------------------------------------- | --------------------------------------- |
| `200` (optionally `{ "member": true }` or `{ "data": { "member": true } }`) | joins the socket to `conversation:{id}` |
| `200` with `member: false`, `403` or `404`                                  | `CONVERSATION_ACCESS_DENIED`            |
| any other status, timeout (`LARAVEL_API_TIMEOUT_MS`), network error         | denies (`INTERNAL_ERROR`); fail closed  |

**2. Store a message:** `POST /internal/conversations/{conversationId}/messages`

```json
{ "conversationId": 10, "senderId": 25, "message": "Hello" }
```

| Laravel replies                                                                         | Node does                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `201`/`200` `{ "id": 555, "createdAt": "2026-11-26T10:00:00Z" }` (or wrapped in `data`) | broadcasts `chat:message` with that `id`/`createdAt` |
| `403` (sender no longer a member)                                                       | `CONVERSATION_ACCESS_DENIED`, nothing broadcast      |
| `422` (validation)                                                                      | `INVALID_PAYLOAD`, nothing broadcast                 |
| anything else, unreadable body, timeout                                                 | `MESSAGE_PERSISTENCE_FAILED`, nothing broadcast      |

`createdAt` must be ISO-8601 (Laravel's default `2026-11-26T10:00:00.000000Z` works).

**Messages created elsewhere** (REST, admin, system messages): optionally announce them with `chat.message_created` on `REDIS_CHAT_CHANNEL` so Node delivers them live. Don't re-announce messages that came through `chat:send`.

### Docker Compose (Node service)

```yaml
node-service:
  build: ./node-service
  env_file: ./node-service/.env # or environment: entries / secrets
  environment:
    REDIS_HOST: redis
    LARAVEL_API_URL: http://laravel:8000/api/v1
  depends_on: [redis, laravel]
  expose: ['3000'] # reached through Nginx; publish 3000 only for local debugging
  networks: [app_network]
```

Nginx must upgrade WebSocket connections for `/socket.io/`:

```nginx
location /socket.io/ {
    proxy_pass http://node-service:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}
```

`CORS_ORIGIN` must be the origin the browser actually loads React from (e.g. `http://localhost:8080` behind Nginx).

### Scaling beyond one node

Add `@socket.io/redis-adapter` so room emits reach sockets on other nodes, replace `InMemoryPresenceStore` with a Redis-backed `PresenceStore`, and enable sticky sessions if HTTP long-polling is allowed.
