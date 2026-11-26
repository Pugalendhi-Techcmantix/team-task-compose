# TaskFlow API v1 — Contract

For **Dev 1 (React)** and **Dev 3 (Node.js)**. Laravel owns the data; nothing else connects to PostgreSQL.

- Base URL (through the Nginx gateway): `http://localhost:8080/api/v1`. Laravel directly: `http://localhost:8000/api/v1`
- Every request: `Accept: application/json`. Bodies are JSON (`Content-Type: application/json`).
- Authentication, two modes (same endpoints):
  - **Browser (React):** HttpOnly session cookie (Laravel Sanctum SPA). Call `GET /sanctum/csrf-cookie` first, send cookies (`withCredentials`) and the `X-XSRF-TOKEN` header on POST/PUT/PATCH/DELETE. The app must be served from an origin in `SANCTUM_STATEFUL_DOMAINS` (through the Vite proxy or Nginx gateway).
  - **Tools / services (Postman, curl, Node.js):** `Authorization: Bearer <token>`.
- Dates: `due_date` is `YYYY-MM-DD`. Timestamps are ISO-8601 UTC (`2026-11-26T05:39:21+00:00`).

## Response shapes

**Success:** `{ "data": {...} }`, plus `"message"` on writes. Lists add `links` and `meta`.

**Error** (every 4xx/5xx):
```json
{ "error": { "code": "validation_error", "message": "The given data was invalid.",
             "details": { "title": ["The title field must be at least 3 characters."] } } }
```
`details` appears only for `validation_error`, as field → list of messages.

| Status | `error.code` | When |
|---|---|---|
| 400 | `invalid_json` | Body is not valid JSON |
| 401 | `unauthenticated` | Missing / invalid / expired / revoked token |
| 401 | `invalid_credentials` | Wrong email or password at login |
| 403 | `account_inactive` | The account was deactivated by an admin (login or any call) |
| 403 | `forbidden` | No permission (role/override), or not the owner. `message` says why |
| 409 | `conflict` | Business rule blocks it (e.g. delete a role still in use, delete yourself) |
| 404 | `not_found` | Unknown route, or task doesn't exist / was deleted |
| 405 | `method_not_allowed` | Wrong HTTP verb |
| 422 | `validation_error` | Field validation failed (see `details`) |
| 429 | `too_many_requests` | Rate limit hit. Read the `Retry-After` header (seconds) |
| 500 | `server_error` | Unexpected failure (no internals exposed) |

## Auth

### `POST /auth/login`
Rate limit: 5 attempts per minute per email + IP.

**Browser (cookie mode):** the response sets the `taskflow-session` cookie (HttpOnly, SameSite=Lax) and returns `data.auth = "session"` with `data.user`, and **no token**. A missing or old CSRF cookie returns **419** `csrf_token_mismatch`. Logout destroys the session. Sessions expire after `SESSION_LIFETIME` (120) minutes without activity.

**Tools (token mode):** the response below, with `data.auth = "token"`.
```json
{ "email": "admin@taskflow.test", "password": "password", "device_name": "react-web" }
```
`device_name` is optional (max 100). Logging in again with the same device name replaces that device's old token.

**200**
```json
{ "message": "Login successful.",
  "data": { "token": "1|AbC...", "token_type": "Bearer", "expires_at": "2026-11-27T05:39:21+00:00",
            "user": { "id": 1, "name": "Super Admin", "email": "admin@taskflow.test", "is_active": true,
                      "role_id": 1, "role": { "id": 1, "name": "Super Admin", "slug": "super_admin" },
                      "permissions": { "tasks": { "view": true, "create": true, "update": true, "delete": true },
                                       "users": { "view": true, "create": true, "update": true, "delete": true } },
                      "created_at": "...", "updated_at": "..." } } }
```
Errors: 401 `invalid_credentials`, 403 `account_inactive` (only after a correct password), 422, 429.

`permissions` is the user's **effective** permission matrix (role + personal overrides). Use it to show or hide buttons. The server enforces the same rules either way.

### `GET /auth/me` → 200 `{ "data": User }` (same shape as `user` above, including `permissions`)
**Node.js:** call this with the token a Socket.IO client sends in its handshake to verify who it is. 200 = valid, 401/403 = reject the socket.

### `POST /realtime/token` → 200
For the Socket.IO handshake. Works with a cookie session or a Bearer token.
```json
{ "data": { "token": "<JWT, HS256, 15 min>", "expires_at": "2026-11-26T10:34:08+00:00" } }
```
Claims: `sub` (user id as a string), `iss: "taskflow"`, `aud: "realtime-service"`, `iat`, `exp`. Returns 503 if the server's `REALTIME_TOKEN_SECRET` isn't configured.

### Internal (Node.js only)
`/api/v1/internal/*` needs `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>` (401 `invalid_service_token` otherwise) and is blocked at the gateway. See [NODE_INTEGRATION.md](NODE_INTEGRATION.md) §4: membership check and save message.

### `POST /auth/logout` → 204
Revokes the token used for the request.

## Access control

> **⚠️ Current mode (team decision, 2026-11-26): permission checks are switched OFF on all APIs.**
> Any **logged-in** user can do full CRUD on tasks, users, roles and permission overrides. Login is still required (401 otherwise), and the data-safety rules below (409) still apply.
> The tables and `/auth/me → permissions` still exist, so the UI can show or hide things, but the server does **not** enforce them.
> The rules described in the rest of this section are the design to switch back on later.

```
users.role_id ──▶ roles ◀── role_permissions (role × module: view/create/update/delete)
users ◀── user_permissions (per-user overrides: true / false / null = inherit)
modules: tasks, users
```
- **Super Admin** (`super_admin`) can do everything. It is the only role that can manage roles, permissions and per-user overrides, or assign the Super Admin role.
- Everyone else: **effective permission = user override (if not null) → role permission → false**.
- Ownership rules on top of permissions:
  - Task **update** needs `tasks.update` plus being the creator or assignee.
  - Task **delete** needs `tasks.delete` plus being the creator.
- Safety rules (409):
  - You can't change your own role, deactivate yourself or delete yourself.
  - The last active Super Admin can't be demoted, deactivated or deleted.
  - System roles (`super_admin`, `user`) can't be deleted.
  - A role that still has users can't be deleted.
- Deactivating a user or changing their password signs them out everywhere (their tokens are revoked).

| Seeded role | tasks | users |
|---|---|---|
| Super Admin | all | all |
| User | view, create, update, delete (own) | view |

## Users  (module `users`)

| Method | URL | Permission | Success |
|---|---|---|---|
| GET | `/users?search=&role_id=&is_active=&per_page=&page=` | users.view | 200 paginated `{data, links, meta}` |
| POST | `/users` | users.create | 201 + `Location` |
| GET | `/users/{id}` | users.view | 200 |
| PATCH | `/users/{id}` | users.update | 200 (partial) |
| DELETE | `/users/{id}` | users.delete | 204 (soft delete; their tasks keep their name) |
| GET | `/users/{id}/permissions` | Super Admin | 200 role/override/effective per module |
| PUT | `/users/{id}/permissions` | Super Admin | 200 |

**Create body**
```json
{ "name": "Kavin", "email": "kavin@taskflow.test", "password": "secret123",
  "password_confirmation": "secret123", "role_id": 2, "is_active": true }
```
Rules:
- `name`: 2–100 characters.
- `email`: unique among active users, compared case-insensitively.
- `password`: at least 8 characters, including letters and numbers, plus a matching `password_confirmation`.
- `role_id`: must be an existing role. Only a Super Admin can assign the Super Admin role.

PATCH accepts any subset of these fields.

**User object:** `{ id, name, email, is_active, role_id, role: { id, name, slug }, created_at, updated_at }`

**Per-user overrides:** `PUT /users/{id}/permissions`
```json
{ "permissions": { "tasks": { "view": null, "create": null, "update": null, "delete": false } } }
```
- `true` / `false` overrides the role's value. `null` means "inherit from the role".
- Every module you send has all 4 of its actions replaced. Modules you don't send stay as they are.
- A module set to all `null` has its override removed.

Response:
```json
{ "data": { "user": {...},
  "modules": [ { "module": "tasks",
                 "role":      { "view": true, "create": true, "update": true, "delete": true },
                 "override":  { "view": null, "create": null, "update": null, "delete": false },
                 "effective": { "view": true, "create": true, "update": true, "delete": false } } ] } }
```

## Roles  (Super Admin only, except the dropdown lookup `/roles/options`)

| Method | URL | Success |
|---|---|---|
| GET | `/roles/options` | **Dropdown lookup**, any logged-in user (no permission check): 200 `{ data: [{ id, name, slug, assignable }] }`. `assignable: false` = you may not give this role (only a Super Admin assigns Super Admin) |
| GET | `/roles` | 200 `[Role]` with `permissions` + `users_count` (roles master, Super Admin only) |
| POST | `/roles` | 201 + `Location` |
| GET | `/roles/{id}` | 200 |
| PATCH | `/roles/{id}` | 200 (only the fields, modules or actions you send change) |
| DELETE | `/roles/{id}` | 204, or 409 if it's a system role or still has users |
| GET | `/modules` | 200 `{ data: [{id, key, name, description}], meta: { actions: ["view","create","update","delete"] } }` |
| GET | `/permissions` | 200 flat list `{ data: [{ key: "tasks.view", module, module_name, action, label: "View tasks" }], meta: { total, modules, actions } }`. Read-only |

**Create body**
```json
{ "name": "Team Lead", "description": "Leads a squad",
  "permissions": { "tasks": { "view": true, "create": true, "update": true, "delete": true },
                   "users": { "view": true, "create": false, "update": false, "delete": false } } }
```
- `name`: 2–50 characters, starting with a letter, unique case-insensitively. The `slug` is generated from it (`team_lead`).
- Modules you leave out get all `false`.
- The Super Admin role's permissions can't be changed (409).

**Role object:** `{ id, name, slug, description, is_system, is_super_admin, users_count, permissions: { tasks: {...}, users: {...} }, created_at, updated_at }`

## Tasks

**Task object**
```json
{ "id": 6, "title": "Build dashboard", "description": null,
  "status": "todo", "priority": "high", "due_date": "2026-12-01", "is_overdue": false,
  "completed_at": null, "created_by": 1, "assigned_to": 2,
  "creator":  { "id": 1, "name": "Admin User", "email": "admin@taskflow.test" },
  "assignee": { "id": 2, "name": "Priya Raman", "email": "priya@taskflow.test" },
  "created_at": "...", "updated_at": "..." }
```
`status`: `todo | in_progress | done`. `priority`: `low | medium | high`. `assignee` is `null` when unassigned. `completed_at` is set automatically when status becomes `done`, and cleared otherwise.

### `GET /tasks`
| Query | Rule |
|---|---|
| `status` | `todo`, `in_progress`, `done` |
| `priority` | `low`, `medium`, `high` |
| `assigned_to`, `created_by` | user id |
| `due_from`, `due_to` | `YYYY-MM-DD` (`due_to` ≥ `due_from`) |
| `search` | ≤100 chars, case-insensitive match on title + description |
| `sort` | `created_at`, `updated_at`, `due_date`, `title`; prefix `-` for descending. Default `-created_at` |
| `per_page` | 1–100, default 15 |
| `page` | ≥1 |

An invalid parameter returns 422. **200:**
```json
{ "data": [Task], "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
  "meta": { "current_page": 1, "last_page": 4, "per_page": 15, "total": 52, "from": 1, "to": 15, ... } }
```

### `POST /tasks` → 201 + `Location` header
| Field | Rule |
|---|---|
| `title` | **required**, 3–255 chars |
| `description` | optional, ≤5000 chars |
| `status` | optional, default `todo` |
| `priority` | optional, default `medium` |
| `due_date` | optional, `YYYY-MM-DD`, today or later |
| `assigned_to` | optional id of an **active** user, or `null` |

`created_by` is always the logged-in user. It can't be set from the body.

### `GET /tasks/{id}` → 200 | 404

### `PUT|PATCH /tasks/{id}` → 200
Needs `tasks.update` **and** being the creator or assignee (Super Admin: any task). Partial update: send only the fields you're changing (same rules as create). An empty body returns 422 (`details.body`). An existing past `due_date` can be re-sent unchanged; a *new* date can't be in the past.

### `DELETE /tasks/{id}` → 204
Soft delete. Needs `tasks.delete` **and** being the creator (Super Admin: any task); otherwise 403 with the reason.

## Notifications

The logged-in user's own notifications (someone else's id returns 404). Laravel stores them and computes the unread count; every change is pushed live (Redis → Node → all of the user's tabs).

| Method | URL | Response |
|---|---|---|
| GET | `/notifications?unread=1&per_page=20&page=1` | 200 paginated, newest first; `meta.unread_count` |
| GET | `/notifications/unread-count` | 200 `{ "data": { "unread_count": 4, "count": 4 } }` (`count` = older alias) |
| POST | `/notifications/{id}/read` | 200 `{ "data": { ...notification, "unread_count": 3 } }`. Calling it again is safe |
| POST | `/notifications/read-all` | 200 `{ "data": { "updated": 3, "unread_count": 0 } }` |

**Notification object** (Laravel's standard shape, snake_case; `id` is a UUID):
```json
{ "id": "551f6cd6-9d4c-4489-a627-88b2eb3d7b41", "type": "task.assigned",
  "data": { "type": "task.assigned", "title": "Task assigned to you", "message": "Priya Raman assigned you \"Node contract check\"", "task_id": 13 },
  "read_at": null, "created_at": "2026-11-26T12:13:38+00:00" }
```

**When one is created:** the assignee gets **one notification per task save**, never for their own changes, and only if they're active. The type is the most important change in that save: `task.created` (created already assigned) > `task.assigned` > `task.status_changed` > `task.updated`.

## Chat: conversations & message history

Any logged-in user. **Only members** can open a conversation or read its messages (403 otherwise). This is chat privacy, so it applies even while role permissions are off. **Messages are sent through Socket.IO** (Node saves them via the internal API); REST is for listing, starting and history. Chat responses use **camelCase**, like the socket events.

| Method | URL | Success |
|---|---|---|
| GET | `/conversations?per_page=&page=` | 200 paginated, my conversations, most recent activity first |
| POST | `/conversations` | 201 created, or **200** if that direct chat already exists (+ `Location`) |
| GET | `/conversations/{id}` | 200 conversation with members |
| GET | `/conversations/{id}/messages?before_id=&limit=` | 200 history, newest first (limit 1–100, default 30) |
| GET | `/conversations/unread-count` | 200 `{ "data": { "unread_count": 4 } }` (total across my chats) |
| POST | `/conversations/{id}/read` | 200 `{ "data": { "conversationId": 5, "unreadCount": 0, "totalUnread": 3 } }`; 403 if not a member |

**Unread:** each conversation in the list (and `GET /conversations/{id}`) has `unreadCount` = messages after my last read that I didn't send. My own messages never count. Live updates arrive as `chat.unread_changed` (see Real-time events).

**Conversation object**
```json
{ "id": 2, "type": "direct", "title": null, "name": "Arun Kumar",
  "members": [ { "id": 2, "name": "Priya Raman", "email": "priya@taskflow.test" }, { "id": 3, "name": "Arun Kumar", "email": "arun@taskflow.test" } ],
  "lastMessage": { "id": 5, "conversationId": 2, "senderId": 2, "message": "Hello", "createdAt": "2026-11-26T10:19:08+00:00" },
  "lastMessageAt": "2026-11-26T10:19:08+00:00", "createdBy": 2, "createdAt": "…" }
```
`name` = the group title, or for a direct chat **the other person's name**. `lastMessage` is `null` in a new chat.

**Start a chat**
```json
{ "type": "direct", "user_id": 3 }
{ "type": "group", "title": "Release squad", "member_ids": [2, 3] }
```
- A direct chat with the same person is reused, never duplicated, even if two requests arrive at once.
- You are added to groups automatically.
- Validation (422):
  - `type` must be `direct` or `group`.
  - `user_id` / `member_ids.*` must be active users. A direct chat can't be with yourself.
  - A group needs a `title` (2–100 characters) and 1–49 distinct `member_ids`.

**Message history**: `GET /conversations/2/messages?limit=30`
```json
{ "data": [ { "id": 5, "conversationId": 2, "senderId": 2, "message": "Hello", "createdAt": "…" }, … ],
  "meta": { "hasMore": true, "nextBeforeId": 4, "limit": 30 } }
```
- Newest first. For the next (older) page, pass `?before_id=<meta.nextBeforeId>`; stop when `hasMore` is false.
- Each message has **exactly the same shape as the socket's `chat:message`**, so history and live messages can share one list (de-duplicate by `id`).

## Real-time events (Redis Pub/Sub) — for Node.js

- Channel: **`taskflow:tasks`** (env `REDIS_EVENTS_CHANNEL`, no key prefix)
- Published **after** the DB transaction commits. A Redis outage never fails the API call.

```json
{ "event": "task.created" | "task.updated" | "task.deleted",
  "occurred_at": "2026-11-26T05:39:21+00:00",
  "actor_id": 1,
  "data": { ...Task object... } }
```
For `task.deleted`, `data` is just `{ "id": 6 }`. `actor_id` is the user who made the change (`null` for system or CLI changes).

Node.js example:
```js
const sub = createClient({ url: 'redis://redis:6379' });
await sub.connect();
await sub.subscribe('taskflow:tasks', (raw) => {
  const msg = JSON.parse(raw);
  io.emit(msg.event, msg);          // e.g. "task.created"
});
```

## Seeded users (password: `SEED_DEFAULT_PASSWORD`, default `password`)
| Email | Role |
|---|---|
| admin@taskflow.test | Super Admin |
| priya@taskflow.test | User |
| arun@taskflow.test | User |

## Health
`GET /api/health` → 200 `{"status":"ok","checks":{"database":"up","redis":"up"}}`, or 503 when either is down.
