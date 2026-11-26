# TaskFlow — Team Handoff (Laravel backend)

**Who reads this:** Dev 1 (React), Dev 3 (Node.js), and anyone joining the project.
**Status (2026-11-26):** Laravel API is running in Docker on Dev 2's PC (`192.168.1.37`). 109 automated tests pass.

Detailed references (this file is the step-by-step summary):
- [API.md](API.md): every endpoint, field and error code
- [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md): React code examples
- [NODE_INTEGRATION.md](NODE_INTEGRATION.md): Node.js code examples and the event contract

---

## 1. How the pieces fit

```
Browser (React, Dev 1)
   │  /api/*, /sanctum/*  (through the Vite proxy / Nginx gateway, same origin → cookies work)
   ▼
Laravel API (Dev 2) ───────────────▶ PostgreSQL   (only Laravel touches the database)
   │  PUBLISH task events
   ▼
Redis ──SUBSCRIBE──▶ Node.js (Dev 3) ──Socket.IO──▶ Browser
                        │  /api/v1/internal/*  (service token): check membership, save chat messages
                        └──────────────────────▶ Laravel
```

**Rules:**
- Laravel owns all data. Node.js never connects to PostgreSQL.
- The browser never calls `/api/v1/internal/*`.
- Chat messages are **sent** through Socket.IO (Node saves them in Laravel). Chat **history** comes from Laravel REST.

---

## 2. What the Laravel backend provides (done)

| Area | What was built |
|---|---|
| **Database** (PostgreSQL 17) | Tables: `users`, `roles`, `modules`, `role_permissions`, `user_permissions`, `tasks`, `conversations`, `conversation_members`, `messages`, `personal_access_tokens`. Foreign keys, CHECK constraints, indexes, timestamptz, soft deletes |
| **Seed data** | 3 users, 2 roles, 5 demo tasks, 2 sample chats (rerunning the seeders never duplicates or overwrites data) |
| **Login** | Browser: **HttpOnly session cookie** (Laravel Sanctum, with CSRF protection). Postman/curl: Bearer token. Login is rate-limited (5/min) and deactivated users are blocked |
| **Tasks** | Full CRUD, filters, search, sorting, pagination, soft delete |
| **Users / Roles / Permissions** | Full CRUD, role dropdown, permission matrix, per-user overrides. **Permission checks are currently OFF** (team decision): any logged-in user can do everything |
| **Chat** | Conversation list, start a direct or group chat, message history (members only) |
| **Realtime** | 15-minute JWT for the socket, internal API for Node (service token), task events on Redis (contract v1) |
| **Security** | One JSON error format, correct HTTP status codes, CORS from `.env`, trusted proxy, Redis password + ACL (Node user is subscribe-only), Postgres reachable only from Dev 2's PC |
| **Docker** | Multi-stage Dockerfile (PHP-FPM + Nginx, non-root, health check), `compose.yaml` (laravel + postgres + redis) |

### Quick facts
| Item | Value |
|---|---|
| API base (from the team's laptops) | `http://192.168.1.37:8000/api/v1` |
| Health check | `http://192.168.1.37:8000/api/health` → `{"status":"ok",...}` |
| Redis (Node only) | `192.168.1.37:6379`, user `taskflow_node`, channel `taskflow:tasks` |
| Logins (password `password`) | `admin@taskflow.test` (id 1, Super Admin), `priya@taskflow.test` (id 2), `arun@taskflow.test` (id 3) |
| Sample chats | #1 group "TaskFlow Team" (users 1, 2, 3), #2 direct Priya ↔ Arun |

### All endpoints
| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `GET /auth/me` · `POST /auth/logout` · `GET /sanctum/csrf-cookie` |
| Realtime | `POST /realtime/token` |
| Tasks | `GET/POST /tasks` · `GET/PUT/PATCH/DELETE /tasks/{id}` |
| Users | `GET/POST /users` · `GET/PATCH/DELETE /users/{id}` · `GET/PUT /users/{id}/permissions` |
| Roles | `GET /roles/options` (dropdown) · `GET/POST /roles` · `GET/PATCH/DELETE /roles/{id}` · `GET /modules` · `GET /permissions` |
| Chat | `GET/POST /conversations` · `GET /conversations/{id}` · `GET /conversations/{id}/messages` |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/{id}/read` · `POST /notifications/read-all` |
| Internal (Node only) | `GET /internal/conversations/{id}/members/{userId}` · `POST /internal/conversations/{id}/messages` |

---

## 3. Dev 1: React frontend, step by step

### Step 1. Send Dev 2 your exact origin
Tell Dev 2 the URL the browser shows, for example `http://192.168.1.64:5174`. Dev 2 adds it to `CORS_ALLOWED_ORIGINS` and `SANCTUM_STATEFUL_DOMAINS`. **Currently allowed:** `http://192.168.1.64:5174`, `http://192.168.1.222:5173`, `http://192.168.1.222:5174`, `http://localhost:5173`, `http://localhost:5174`, `http://localhost:8080`.

### Step 2. Add the Vite proxy (required for cookie login)
The browser only sends the login cookie to the **same site**. Calling `http://192.168.1.37:8000` directly from your laptop **will not work** (you'd always get 401).
```js
// vite.config.js
server: { host: true, port: 5174, proxy: {
  '/api':     { target: 'http://192.168.1.37:8000' },
  '/sanctum': { target: 'http://192.168.1.37:8000' },
}}
```
Use relative URLs in code (`/api/v1/...`). Check it works: open `http://<your-ip>:5174/api/health`.

> Node's guide suggests `VITE_API_URL=http://192.168.1.37:8000`. **Don't use that for Laravel calls.** Keep the proxy. The socket can still connect directly to Node (it uses the JWT, not cookies).

### Step 3. Set up the axios client
`baseURL: '/api/v1'`, `withCredentials: true`, `withXSRFToken: true`. No token in `localStorage`, no `Authorization` header. On **419**, call `/sanctum/csrf-cookie` and retry. On **401**, go to the login page. (Code: FRONTEND_INTEGRATION.md §3.)

### Step 4. Login flow
1. `GET /sanctum/csrf-cookie`
2. `POST /api/v1/auth/login` `{ email, password }` → `data.user` (with `role` and `permissions`)
3. On page load: `GET /api/v1/auth/me` (401 = not logged in)
4. Logout: `POST /api/v1/auth/logout`

### Step 5. Task screens
| Screen | API |
|---|---|
| List with filters | `GET /tasks?status=&priority=&assigned_to=&search=&sort=-created_at&per_page=15&page=1` |
| Create | `POST /tasks` (title required, 3–255 chars; due date today or later) |
| Edit / change status | `PATCH /tasks/{id}` (send only the fields you change) |
| Delete | `DELETE /tasks/{id}` → 204 |
| Assignee dropdown | `GET /users?is_active=1&per_page=100` |

Values: status `todo | in_progress | done`, priority `low | medium | high`.

### Step 6. Users, Roles, Permissions screens
| Screen | API |
|---|---|
| Users list / create / edit / deactivate / delete | `GET/POST /users`, `PATCH /users/{id}` (`is_active: false`), `DELETE /users/{id}` |
| Role dropdown | `GET /roles/options` |
| Roles master + permission matrix | `GET /modules`, `GET/POST/PATCH/DELETE /roles` |
| Permission list page (read-only) | `GET /permissions` (remove any "New permission" button) |
| One user's overrides | `GET/PUT /users/{id}/permissions` |

### Step 7. Show errors
Every error: `{ "error": { "code", "message", "details"? } }`.
- **422:** show `details[field][0]` under each input.
- **401:** go to login. **419:** CSRF refresh (automatic). **429:** "slow down".
- **409:** show `message` (e.g. "You cannot delete your own account.").
- **403** won't happen for permissions right now (checks are off).

### Step 8. Chat screens
| Screen | API |
|---|---|
| Chat list | `GET /conversations` (use `name` and `lastMessage`) |
| Start a 1-to-1 chat | `POST /conversations` `{type:"direct", user_id}` (reuses the existing chat) |
| New group | `POST /conversations` `{type:"group", title, member_ids:[…]}` |
| Open a chat | `GET /conversations/{id}/messages?limit=30`, then `?before_id=<meta.nextBeforeId>` for older |
| Send / typing / live | **Socket.IO only** (Dev 3's events: `conversation:join`, `chat:send`, `chat:message`) |

History messages have the **same shape** as the socket `chat:message`: `{id, conversationId, senderId, message, createdAt}`. Keep one list and de-duplicate by `id`.

### Step 9. Socket.IO connection
1. `POST /api/v1/realtime/token` → `{ token, expires_at }` (15 minutes)
2. `io(NODE_URL, { auth: (cb) => fetchRealtimeToken().then((token) => cb({ token })) })`, so every reconnect gets a fresh token
3. Don't store the realtime token anywhere.

### Dev 1 must send
- [ ] Your exact origin(s) to **Dev 2** (CORS + cookie login), and to **Dev 3** (socket CORS)

---

## 4. Dev 3: Node.js realtime service, step by step

### Step 1. Get the 3 secrets from Dev 2 (privately)
| Node env var | What it is |
|---|---|
| `REALTIME_TOKEN_SECRET` | verifies the socket JWT (HS256), same value as Laravel's |
| `LARAVEL_SERVICE_TOKEN` | Bearer token for `/api/v1/internal/*` (Laravel's `INTERNAL_SERVICE_TOKEN`) |
| Redis password | goes in `REDIS_URL=redis://taskflow_node:<password>@192.168.1.37:6379` |

Plus: `LARAVEL_API_URL=http://192.168.1.37:8000/api/v1`, `REDIS_EVENTS_CHANNEL=taskflow:tasks`.

### Step 2. Verify the socket JWT locally
`jwt.verify(token, REALTIME_TOKEN_SECRET, { algorithms:['HS256'], issuer:'taskflow', audience:'realtime-service' })`, then `userId = Number(claims.sub)`. No HTTP call to Laravel is needed.

### Step 3. Chat: call the internal API (always with the service token)
| Call | Success / errors |
|---|---|
| `GET /internal/conversations/{id}/members/{userId}` | 200 member · 404 `not_a_member` / `not_found` · 403 `account_inactive` |
| `POST /internal/conversations/{id}/messages` `{conversationId, senderId, message}` | 201 `{id, createdAt}` · 403 `not_a_member` / `account_inactive` · 422 validation |

- `senderId` comes **from the JWT**, never from the client.
- Broadcast `chat:message` **only after a 201**.
- These routes have their own rate limit (6000/min).

### Step 4. Subscribe to task events (Redis)
Channel `taskflow:tasks`. Message format (v1):
```json
{ "eventId": "<uuid>", "event": "task.assigned", "version": 1,
  "payload": { "taskId": 13, "assignedTo": 1, "title": "Fix payment bug", "createdBy": 2, "assignedBy": 2,
               "notificationId": "<uuid>", "unreadCount": 1 },
  "occurredAt": "2026-11-26T12:13:38Z" }
```
- Exactly 5 fields; optional payload fields are left out (never `null`); `occurredAt` is UTC with `Z`.
- Events: `task.created`, `task.assigned`, `task.status_changed` (+ `status`, `previousStatus`), `task.updated`, `notification.count_changed` (`userId`, `unreadCount`). Actor fields: `createdBy`, `assignedBy`, `updatedBy`, `changedBy`.
- One update can produce several events, in the order assigned → status_changed → updated.
- Published only after the database commit. De-duplicate by `eventId`.
- The event that stored the assignee's notification also carries `notificationId` + `unreadCount`. `task.deleted` is not published.

### Step 5. Gateway (final Docker setup)
Block `location /api/v1/internal/ { return 404; }`. Proxy `/socket.io/` to Node (with the WebSocket upgrade headers), and `/api/` and `/sanctum/` to `laravel:8000`. (Full Nginx config: NODE_INTEGRATION.md §6.)

### Step 6. Merge into the root `docker-compose.yml`
Copy the `laravel`, `postgres` and `redis` services from `compose.yaml` (including `docker/redis/start.sh` for the Redis ACL), set `build.context: ./laravel`, and pass every variable from `.env.example`. Node joins the same network and uses `http://laravel:8000` and `redis://taskflow_node:…@redis:6379`.

### Dev 3 must send
- [ ] **To Dev 1:** the socket URL (`http://<node-ip>:3000`), the event names and payloads, and the error codes (your realtime guide)
- [ ] **To Dev 2:** a note if you need a new event field or a chat Redis channel (`taskflow:chat`). It isn't needed now, because all messages go through the socket.

---

## 5. Dev 2 (Laravel) shares

| With | What | How |
|---|---|---|
| Dev 1 | This file, API.md, FRONTEND_INTEGRATION.md, test logins | repo / chat |
| Dev 3 | This file, NODE_INTEGRATION.md, API.md, `compose.yaml` + `Dockerfile` + `docker/` | repo / chat |
| Dev 3 | `REALTIME_TOKEN_SECRET`, `INTERNAL_SERVICE_TOKEN`, `REDIS_NODE_PASSWORD` (from Dev 2's `.env`) | **privately only** |
| Nobody | `APP_KEY`, `DB_PASSWORD`, `REDIS_PASSWORD` (Laravel's own) | never shared |

Share `.env.example`, **never `.env`**.

---

## 6. Current decisions and open items

| # | Item | Status |
|---|---|---|
| 1 | Permission checks are **off** on all APIs (any logged-in user can do everything, including creating a Super Admin) | Temporary, for testing. Turn back on before production |
| 2 | Notifications (list, unread count, mark read, live count) | **Done.** Built to Node's spec; events carry `notificationId` + `unreadCount`, plus `notification.count_changed` |
| 3 | Message length: Node allows 2000, Laravel 5000 | Works (Node is stricter). Can be aligned to 2000 |
| 4 | Node's guide says `VITE_API_URL=http://192.168.1.37:8000` | Use the **Vite proxy** for Laravel instead (see Dev 1, Step 2) |
| 5 | Project has no git yet | Recommended: `git init` + first commit before merging repos |

---

## 7. Five-minute smoke test (everyone)

1. `http://192.168.1.37:8000/api/health` → `"status":"ok"`
2. React: log in as `priya@taskflow.test` → the task list loads
3. React: open the chat list → "Arun Kumar" and "TaskFlow Team"
4. Two browsers (Priya + Arun) in chat #2 → messages appear live on both sides, and stay after refresh (history)
5. Assign a task to Arun → Arun gets a notification (Node) and the task list updates
