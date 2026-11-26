# TaskFlow Frontend Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dev 1 deliverable of TaskFlow: a React task dashboard with login/register,
task CRUD over the Laravel REST API, live Socket.IO notifications, and an Nginx Docker image.

**Architecture:** Vite-built React SPA served by Nginx. Nginx also reverse-proxies `/api` to
Laravel and `/socket.io` to the Node.js service, so the browser talks to one origin. A mock
backend (`mock/server.js`) implements the contract below so the frontend can run before Dev 2 and
Dev 3 finish.

**Tech Stack:** Vite 7, React 19 (JSX), Tailwind CSS v4, Framer Motion, react-router 7, axios,
socket.io-client, Vitest + Testing Library, Nginx 1.27, Node 24 (build stage).

**Spec:** Team architecture images (`TaskFlow Full-Stack Docker Architecture.png`,
`Team Docker Compose Architecture Infographic.png`) and the Dev 1 brief:
task dashboard and creation form · API integration · Socket.IO notification listener ·
Dockerfile and Nginx configuration · login and auth · env config.

## 1. Global Constraints

- Frontend only. No database or Redis access from the browser.
- Container listens on port **80**; compose maps it to host **6001** (`"6001:80"`, on all
  interfaces so the LAN can reach it). Not 6000: browsers block it (`ERR_UNSAFE_PORT`).
- Dev server binds `0.0.0.0` so teammates can open `http://<host-LAN-IP>:<port>`.
- Upstream service names in compose: **`laravel:8000`** and **`node-service:3000`**.
- Docker network name: **`app_network`** (fixed `name:`). Nginx uses Docker DNS
  (`resolver 127.0.0.11`) so it starts even when upstreams are not up yet.
- Client env vars use the `VITE_` prefix and are baked in at build time.
- All API calls use relative `/api`; socket uses same origin + path `/socket.io`.
- Mobile-first; layouts work at 375 / 768 / 1440 px.

### Approved UI / UX baseline

- Visual direction: compact real-time operations workspace using paper (`#f1f2ec`), graphite,
  white surfaces and lime as the live/success accent. Theme values live in `src/index.css`.
- Authenticated page headlines cap at `4.5rem` and start at `2.35rem`; do not use oversized
  7-9rem headings. Secondary headings use the 2xl/3xl scale.
- Tasks, Users and Roles use the wide 1600px application canvas, asymmetric Bento summaries,
  1.5-1.75rem card radii and dense responsive lists.
- Framer Motion provides spring entrances, hover/tap feedback, shared-layout nav movement and
  workflow illustrations. Every repeating or decorative animation respects reduced-motion settings.
- Login/Register use `AuthLayout`; desktop includes the interactive code-native workflow illustration,
  while mobile keeps a focused single-viewport form.
- Tasks overview: focus card + real-data animated team workflow + Todo/In progress/Done cards + live
  task queue. Standalone Due Today and Overdue summary cards are intentionally excluded.
- Users and Roles follow the same design system with compact access metrics, animated cards and shared
  form sections. No UI redesign may change REST, auth, reducer or Socket.IO behaviour.
- Visual acceptance: no horizontal overflow and deliberate layouts at 375 / 768 / 1440 px; keyboard
  controls, visible focus, reduced motion and readable contrast are required.

## 2. Folder structure

```
TEAM_CLIENT/                      (= taskflow/frontend)
├── CLAUDE.md  PLAN.md  README.md
├── package.json  vite.config.js  eslint.config.js  index.html
├── .env.example  .env  .gitignore  .dockerignore
├── Dockerfile                    multi-stage: node build → nginx
├── nginx.conf                    static + SPA fallback + /api + /socket.io proxy
├── mock/server.js                dev-only mock of Laravel + Node contract
└── src/
    ├── main.jsx  App.jsx  index.css
    ├── config/env.js
    ├── api/      client.js  auth.js  tasks.js  errors.js
    ├── context/  AuthContext.jsx  NotificationContext.jsx
    ├── socket/   socket.js  useTaskSocket.js
    ├── lib/      tasksReducer.js  validateTask.js  format.js
    ├── routes/   ProtectedRoute.jsx  GuestRoute.jsx
    ├── pages/    LoginPage.jsx  RegisterPage.jsx  DashboardPage.jsx  NotFoundPage.jsx
    ├── components/
    │   ├── layout/        AppHeader.jsx  AuthLayout.jsx
    │   ├── tasks/         TaskStats.jsx  TaskFilters.jsx  TaskList.jsx  TaskCard.jsx  TaskForm.jsx
    │   ├── notifications/ ToastStack.jsx  NotificationBell.jsx
    │   └── ui/            Button.jsx  Field.jsx  Modal.jsx  Badge.jsx  Spinner.jsx
    └── test/setup.js     (+ *.test.js(x) next to the code they test)
```

## 3. API & Socket contract (shared with Dev 2 / Dev 3)

Dev 2's backend (dev: `http://192.168.1.37:8000`). Base path **`/api/v1`**
(`VITE_API_BASE_URL`). Header `Authorization: Bearer <token>`, `Accept: application/json`.

Status column: ✅ = confirmed by probing the live backend on 2026-11-26 (status code and error
shape only, no login). ❓ = assumed, not yet confirmed.

| Method | Path (under `/api/v1`) | Body | Response | |
|---|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ user?, token \| access_token }` · 422 | ✅ route · ❓ body |
| GET | `/auth/me` | — | `user` / `{ data: user }` / `{ user }` | ✅ route (401 w/o token) |
| POST | `/auth/logout` | — | `204` | ✅ route (401 w/o token) |
| POST | `/auth/register` | — | — | ❌ **404, no route** |
| GET | `/tasks` | query: `status?` | `{ data: Task[] }` | ✅ route (401 w/o token) · ❓ body |
| POST | `/tasks` | `TaskInput` | `{ data: Task }` | ❓ |
| PUT | `/tasks/{id}` | `TaskInput` (partial ok) | `{ data: Task }` | ❓ (PATCH?) |
| DELETE | `/tasks/{id}` | — | `204` | ❓ |
| GET | `/users` | — | — | ✅ route exists (401 w/o token) |
| GET | `/api/health` (no v1) | — | `{ status, checks: { database, redis } }` | ✅ |

Error envelope (✅ confirmed):
`{ "error": { "code": "validation_error" | "unauthenticated" | "not_found", "message": "...", "details": { "field": ["msg"] } } }`.
`src/api/errors.js` reads this and also Laravel's default `{ message, errors }`.

```
User      = { id, name, email }
Task      = { id, title, description, status, priority, due_date, user_id, created_at, updated_at }
status    = "todo" | "in_progress" | "done"   // labels: Todo, In Progress, Done (src/lib/taskStatus.js)
priority  = "low" | "medium" | "high"
due_date  = "YYYY-MM-DD" | null
TaskInput = { title (required, ≤255), description?, status, priority, due_date? }
```

The `Task` shape and the status/priority values above are **still assumptions (❓)**. Confirm
them against a real `GET /api/v1/tasks` response.

The frontend accepts both `{ data: X }` and bare `X` for every response.

Socket.IO (Node.js service, Dev 3, `socket.io@4`, path `/socket.io`) — ✅ contract from Dev 3, 2026-11-26.
Dev server: `http://192.168.1.222:3000`; the browser reaches it same-origin through the Vite proxy
(`DEV_SOCKET_TARGET`) / Nginx, so no CORS is involved.
- Auth: `POST /api/v1/realtime/token` (Laravel, session cookie + X-XSRF-TOKEN) → `{ data: { token, expires_at } }`,
  15 min. Handshake `auth: (cb) => fetchRealtimeToken().then(token => cb({ token }))` (fresh token per connect,
  never stored). Rejections arrive as `connect_error.data.code`: `UNAUTHORIZED` | `INVALID_TOKEN` | `TOKEN_EXPIRED`
  (verified). On expiry the server disconnects; the client reconnects with a new token, and after 3 rejections in a
  row signs the user out.
- Server → client: `notification` { id, type, title, message, taskId, createdAt } · `chat:message`
  { id, conversationId, senderId, message, createdAt } · `typing:start`/`typing:stop` { conversationId, userId } ·
  `presence:update` { userId, status, at } · `chat:error` { code, message, event }.
- Client → server (with ack): `conversation:join`/`conversation:leave` { conversationId } · `chat:send`
  { conversationId, message } → { ok: true, data } · `typing:start`/`typing:stop` { conversationId } (no ack).
- **No `task.*` events.** The dashboard re-reads `GET /tasks/{taskId}` when a notification names a task.
- Never send userId/senderId. Add chat messages only from `chat:message`. Limits: 2000 chars, 20 msgs/10 s.
- ❓ Open: notifications REST list, conversations + message history REST, ack error shape, whether the actor
  also gets a notification for their own change.

## 4. Review Focus

1. **Expired/invalid token** → any 401 clears session and lands on `/login`, no blank screen.
2. **Own action echoed by socket** → creating a task adds it once, not twice (reducer upserts by id).
3. **Backend down** → dashboard shows an error with Retry; socket indicator shows "Offline"
   and reconnects automatically.
4. **Laravel 422** → field errors appear under the matching inputs; form keeps user input.
5. **Deep link refresh** (`/register` reload in Nginx) → served by SPA fallback, not 404.

## 5. Tasks

### Task 1: Scaffold + config + docs
**Files:** `package.json`, `vite.config.js`, `eslint.config.js`, `index.html`, `.env*`,
`.gitignore`, `src/main.jsx`, `src/index.css`, `src/config/env.js`, `src/test/setup.js`
- [x] Install deps: react, react-dom, react-router, axios, socket.io-client; dev: vite,
      @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, vitest, jsdom, @testing-library/*,
      eslint, express, socket.io, concurrently.
- [x] `vite.config.js`: react + tailwind plugins; `server.proxy` `/api` → `DEV_API_TARGET`,
      `/socket.io` → `DEV_SOCKET_TARGET` with `ws: true`; Vitest `environment: 'jsdom'`.
- [x] `src/config/env.js` exports `env = { appName, apiBaseUrl, socketUrl, socketPath }`.
- [x] Verify: `npm run build` succeeds.

### Task 2: API layer
**Files:** `src/api/client.js`, `auth.js`, `tasks.js`, `errors.js` (+ `errors.test.js`, `client.test.js`)
**Produces:**
- `api` (axios instance), `setAuthToken(token|null)`, `onUnauthorized(handler)`, `unwrap(res)`
- `authApi.login({email,password}) → {user, token}`, `register(input)`, `logout()`, `me() → user`
- `tasksApi.list(params) → Task[]`, `create(input) → Task`, `update(id, input) → Task`, `remove(id)`
- `getErrorMessage(err) → string`, `getFieldErrors(err) → { field: string }`
- [x] Tests: `unwrap({data:{data:[1]}})` → `[1]`; `unwrap({data:[1]})` → `[1]`;
      422 → field map with first message; network error → "Cannot reach the server…".
- [x] Implement; tests pass.

### Task 3: Task state + validation
**Files:** `src/lib/tasksReducer.js`, `validateTask.js`, `format.js` (+ tests)
**Produces:** `tasksReducer(state, action)` with actions `loaded`, `upsert`, `remove`;
`validateTask(input) → { field: msg }`; `STATUS_OPTIONS`, `PRIORITY_OPTIONS`.
- [x] Tests: `upsert` of an existing id replaces it (no duplicate); new id prepends;
      `remove` drops by id with string/number ids; empty title → `title` error;
      title > 255 → error.
- [x] Implement; tests pass.

### Task 4: Auth (context, routes, pages)
**Files:** `src/context/AuthContext.jsx`, `src/routes/*`, `src/pages/LoginPage.jsx`,
`RegisterPage.jsx`, `src/components/layout/AuthLayout.jsx`, `src/components/ui/*`
**Produces:** `useAuth() → { user, token, status: 'loading'|'authenticated'|'guest', login, register, logout }`
- [x] On boot: token in storage → `me()`; failure → guest. 401 handler → logout.
- [x] Login/Register forms with field errors from 422, disabled submit while pending.
- [x] Interactive desktop workflow illustration with reduced-motion support; compact mobile auth form.
- [x] Test: LoginPage shows server field error under email input.

### Task 5: Socket.IO listener + notifications
**Files:** `src/socket/socket.js`, `useTaskSocket.js`, `src/context/NotificationContext.jsx`,
`src/components/notifications/*`
**Produces:** `connectSocket(token) → socket`, `disconnectSocket()`;
`useTaskSocket({ onCreated, onUpdated, onDeleted }) → { connected }`;
`useNotifications() → { toasts, history, notify(msg, tone), dismiss(id), markAllRead() }`
- [x] Connect when authenticated, disconnect on logout; reconnect is socket.io default.
- [x] Toasts auto-dismiss after 5s; bell keeps last 20 with unread count.

### Task 6: Dashboard
**Files:** `src/pages/DashboardPage.jsx`, `src/components/tasks/*`, `src/components/layout/AppHeader.jsx`
- [x] Header: brand, live/offline indicator, notification bell, user menu + logout.
- [x] Focus summary, real-data animated team workflow, status cards, filter tabs and search.
- [x] No standalone Due Today / Overdue summary cards; due metadata stays at task level.
- [x] Task list: cards with status + priority badges, due date, quick status change,
      edit, delete (confirm). Empty, loading and error(+Retry) states.
- [x] "New task" opens modal with `TaskForm` (create + edit share it).
- [x] Test: TaskForm blocks submit on empty title and shows the error.

### Task 7: Mock backend
**Files:** `mock/server.js`
- [x] Express on `:8000` implementing §3 in memory + Socket.IO on the same port at `/socket.io`
      emitting task events. Dev proxy targets both at `:8000` when using `npm run dev:mock`.

### Task 8: Docker + Nginx
**Files:** `Dockerfile`, `nginx.conf`, `.dockerignore`
- [x] Stage 1 `node:24-alpine`: `npm ci`, build args → `VITE_*`, `npm run build`.
- [x] Stage 2 `nginx:1.27-alpine`: copy `dist/` + `nginx.conf`; `EXPOSE 80`.
- [x] Nginx: gzip, long cache for `/assets/`, no-cache `index.html`, `try_files … /index.html`,
      `/api/` → `laravel:8000`, `/socket.io/` → `node-service:3000` with Upgrade headers,
      `resolver 127.0.0.11 valid=10s` + variable upstreams, `/healthz`.
- [x] Verify: `docker build` succeeds (if Docker available).

### Task 9: Verify
- [x] `npm test`, `npm run lint`, `npm run build` all pass.
- [x] With `npm run dev:mock`: register → create task → see it live in a second tab → toast.
- [x] Playwright screenshots at 375 / 768 / 1440 px.

## 6. Compose snippet for Dev 3

```yaml
frontend:
  build:
    context: ./frontend
    args:
      VITE_API_BASE_URL: /api
      VITE_SOCKET_PATH: /socket.io
  ports: ["6001:80"]
  depends_on: [laravel, node-service]
  networks: [app_network]

networks:
  app_network:
    name: app_network
```

Laravel and Node.js services must join `app_network` with the service names `laravel` and
`node-service`.

---

# Phase 2 — Users & Roles master (frontend)

**Goal:** Screens to manage users and a roles master list, and give users roles.
**No permissions module** (decided 2026-11-26): roles are plain name + description.
Backend routes for roles didn't exist yet (404 on 2026-11-26); the frontend is built against
the contract below and the mock server. Dev 2: please match it, or tell Dev 1.

## P2.1 Contract (proposed, ❓ until Dev 2 confirms). Base `/api/v1`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/users` | query `search?`, `role_id?` ❓, `page?`, `per_page?` ✅ | `{ data: User[], meta: { current_page, last_page, per_page, total } }` |
| GET | `/users/{id}` | — | `{ data: User }` |
| POST | `/users` | `{ name, email, password, password_confirmation, role_id }` (**role_id required**, ✅ backend) | `201 { data: User }` |
| PUT | `/users/{id}` | same, `password` optional | `{ data: User }` |
| DELETE | `/users/{id}` | — | `204` (422 when deleting yourself) |
| GET | `/roles` | — | `{ data: Role[] }` |
| GET | `/roles/{id}` | — | `{ data: Role }` |
| POST/PUT | `/roles`, `/roles/{id}` | `{ name, description? }` | `{ data: Role }` |
| DELETE | `/roles/{id}` | — | `204` (users lose the role) |
| GET | `/auth/me` | — | user with `role_id` + `role` |

```
User = { id, name, email, is_active, role_id, role: { id, name, slug }, created_at }   // one role per user (✅ backend)
Role = { id, name, description, users_count }
```
Validation errors use the v1 envelope (422 `{ error: { code, message, details } }`).
Any access rule is the backend's: a 403 shows the "no access" state.

## P2.2 Frontend rules
- Nav: Tasks, Users, Roles, shown to every signed-in user. No UI permission checks.
- Users list: role filter options come from the users' own `role` objects (`collectRoles()`), no `/roles` call.
  The user form still loads `/roles` (it needs every role, including unused ones).
- You can't delete your own user from the list.

## P2.3 Tasks
- [x] `lib/roles.js` (roleNames, humanize) + `lib/validateAccess.js` (validateUser, validateRole) + tests
- [x] `api/client.js` `unwrapPage` + `api/resource.js` factory; `api/access.js` (`usersApi`, `rolesApi`)
- [x] App shell: `AppLayout` + nav (Tasks, Users, Roles)
- [x] Users: list (search, role filter, pagination), create/edit page with a single Role select (`role_id`), delete
- [x] Roles master: list (user counts), create/edit page (name, description), delete
- [x] Permissions module removed (page, matrix, guards, API, mock routes)
- [x] Mock server: users + roles CRUD, `/auth/me` roles
- [x] Verify: tests, lint, build, browser at 375/1440

## P2.4 Cookie auth (HttpOnly) — ✅ backend switched 2026-11-26 (Dev 3 socket ❓)

Frontend is ready behind `VITE_AUTH_MODE=cookie` (default stays `token`). Contract when switched:

- `GET /sanctum/csrf-cookie` → 204, sets `XSRF-TOKEN` (JS-readable) ✅ exists today.
- `POST /api/v1/auth/login` with header `X-XSRF-TOKEN` → sets HttpOnly `taskflow-session`;
  body `{ user }` (a `token` may still be returned; the frontend ignores it).
- Every later request: session cookie + `X-XSRF-TOKEN`; 419 = CSRF mismatch (frontend refreshes and retries once).
- `POST /api/v1/auth/logout` invalidates the session.
- Socket.IO handshake: superseded by Dev 3's realtime token (§3): `POST /api/v1/realtime/token` → `auth: { token }`.
- Backend: `SANCTUM_STATEFUL_DOMAINS` = every frontend host:port, `statefulApi()`, `SESSION_DOMAIN=null`.
- Both modes can't run at once for the same origin: switch frontend and backend together.

- [x] Frontend cookie mode (env switch, CSRF, 419 retry, `/auth/me` restore, socket via cookie, `/sanctum` proxy in Vite + Nginx)
- [x] Mock backend supports both modes; verified in browser (HttpOnly cookie, reload, socket Live, 419 retry, logout)
- [x] Dev 2: session login live (`auth: "session"`); frontend default switched to `cookie`
- [x] Dev 3: socket auth via 15-min realtime token (frontend done, verified against mock + live handshake errors)

# Phase 3 — Chat (frontend)

**Goal:** `/chat` page: your conversations, history, live messages, typing, start a chat.
Live side = Node socket contract (§3, ✅ Dev 3). **REST side is PROPOSED** (all routes 404 on
2026-11-26). Dev 2: please build these or tell Dev 1 what you build instead.

## P3.1 REST contract (proposed, ❓ Dev 2). Base `/api/v1`, session cookie auth.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/conversations` | — | `{ data: Conversation[] }` (only ones you're a member of, newest activity first) |
| GET | `/conversations/{id}` | — | `{ data: Conversation }`; **403** if not a member |
| POST | `/conversations` | direct: `{ type: "direct", user_id }` (✅ backend 422s) · group: `{ type: "group", user_ids: number[], name? }` (❓ field name) — you are added automatically | `201 { data: Conversation }`; a direct chat (1 other, no name) that already exists → `200` with the existing one |
| GET | `/conversations/{id}/messages` | `?limit=30&before={messageId}` | `{ data: Message[] oldest→newest, meta: { has_more } }`; **403** if not a member |

```
Conversation = { id, name: string|null, type: 'direct'|'group',
                 members: { id, name }[], last_message: Message|null, updated_at }
Message      = { id, conversation_id, sender_id, sender: { id, name }, message, created_at }
```
- Sending is **only** via the socket (`chat:send`, Laravel saves it). No REST POST for messages.
- `conversation:join` membership must match these REST memberships.
- 422 uses the v1 envelope (`details.member_ids`).

## P3.2 Frontend
- `src/api/chat.js` (`chatApi`, `normalizeMessage` — socket camelCase and REST snake_case → one shape),
  `src/lib/chat.js` (merge/dedupe, titles, typing text, day grouping), `src/socket/useConversation.js`.
- `src/pages/chat/ChatPage.jsx` + `src/components/chat/*` (ConversationList, ChatThread, MessageList,
  Composer, NewConversationDialog, Avatar). Routes `/chat`, `/chat/:conversationId`; nav "Chat".
- Desktop two panes; phone shows list or thread (back button). Enter sends, Shift+Enter newline,
  2000-char counter, errors from contract §6 shown under the box, text kept on failure.
- Known limits: the list only updates live for the open conversation (Node only delivers
  `chat:message` for joined rooms); no unread counts; presence only from events seen since the page opened.

## P3.3 Tasks
- [x] Chat REST client + normalisers + tests
- [x] Chat page, thread, composer, new-conversation dialog
- [x] Mock: chat REST + socket join/leave/send/typing/presence (General=everyone, Managers=Sam only, Demo↔Priya)
- [x] Verified with two browser users: send/receive once, typing on/off, preview update, access denied,
      new direct chat, 375 / 768 / 1440 with no page scroll
- [ ] Dev 2: REST routes P3.1 · [ ] unread counts / notification list (needs REST)
