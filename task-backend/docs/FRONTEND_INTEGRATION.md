# React Frontend ↔ Laravel API — Integration Guide

**For Dev 1 (React).** How to call the TaskFlow API: login, tasks, errors, and real-time updates.
Full endpoint reference: [API.md](API.md).

## 1. Setup: call the API through the Vite proxy (required)

Login uses an **HttpOnly session cookie** (Laravel Sanctum SPA auth). JavaScript never sees a token, and nothing goes in `localStorage`.

Browsers only send cookies to the **same site**. Your app (`192.168.1.64:5174`) and Laravel (`192.168.1.37:8000`) are different sites over plain HTTP, so calling Laravel directly would never send the cookie and you'd always get 401. Let Vite forward the requests instead, so the browser only talks to your own origin:

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api':       { target: 'http://192.168.1.37:8000' },   // Laravel (Dev 2's PC)
      '/sanctum':   { target: 'http://192.168.1.37:8000' },   // CSRF cookie endpoint
      '/socket.io': { target: 'http://<NODE_DEV_IP>:3000', ws: true },  // Node.js (Dev 3)
    },
  },
});
```
- In code, use **relative URLs** (`/api/v1/...`), never `http://192.168.1.37:8000/...`.
- Your origin `192.168.1.64:5174` is registered on the backend (`SANCTUM_STATEFUL_DOMAINS`). If your IP or port changes, tell Dev 2.
- In the full Docker stack, the Nginx gateway (port 8080) does the same job, so the code doesn't change.
- Quick check: open `http://192.168.1.64:5174/api/health` in the browser. You should see `{"status":"ok",...}` (through the proxy).

## 2. Test logins (password: `password`)

| Email | Role | Can do |
|---|---|---|
| admin@taskflow.test | Super Admin | everything, including the users & roles admin screens |
| priya@taskflow.test | User | edit tasks she created or is assigned to; delete tasks she created |
| arun@taskflow.test | User | same as Priya |

## 3. API client (axios)

```js
// src/api/client.js
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,     // send the session cookie
  withXSRFToken: true,       // send X-XSRF-TOKEN from the XSRF-TOKEN cookie (axios ≥ 1.6)
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

// Call once before login (and again after a 419): sets the XSRF-TOKEN cookie.
export const csrf = () => axios.get('/sanctum/csrf-cookie', { withCredentials: true });

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    if (status === 419 && !err.config._retried) {       // CSRF token expired → refresh once and retry
      await csrf();
      return api({ ...err.config, _retried: true });
    }
    if (status === 401 && !err.config.url.endsWith('/auth/login')) {
      window.location.href = '/login';                   // session expired / logged out
    }
    return Promise.reject(err);
  },
);
```
No `Authorization` header and no token handling: the browser attaches the cookie by itself.

## 4. Auth flow

```js
// Login
await csrf();
const { data } = await api.post('/auth/login', { email, password });
const user = data.data.user;   // { id, name, email, is_active, role: { id, name, slug }, permissions: {...} }
// data.data.auth === 'session', and there is NO token in the response.

// On app start / page refresh → who am I? (401 = not logged in)
const me = (await api.get('/auth/me')).data.data;

// Logout
await api.post('/auth/logout');   // 204, session destroyed
```
- The session expires after **120 minutes without activity**, after which any call returns 401.
- Wrong email or password returns **401** `invalid_credentials`. Show `error.message`.
- A deactivated account gets **403** `account_inactive`.
- 5 wrong attempts in a minute returns **429**. Use the `Retry-After` header.
- **419** `csrf_token_mismatch` means the CSRF cookie is missing or old. The interceptor above refreshes it and retries once.

## 5. Tasks

```js
// List with filters + pagination
const res = await api.get('/tasks', {
  params: { status: 'todo', priority: 'high', assigned_to: 2, search: 'docker',
            sort: '-created_at', per_page: 15, page: 1 },
});
res.data.data;                 // Task[]
res.data.meta;                 // { current_page, last_page, per_page, total, ... }

// Create → 201
const created = (await api.post('/tasks', {
  title: 'Build dashboard', description: 'List + filters',
  status: 'todo', priority: 'high', due_date: '2026-12-01', assigned_to: 2,
})).data.data;

// Update (send only changed fields) → 200
await api.patch(`/tasks/${id}`, { status: 'done' });

// Delete → 204 (403 if not creator/admin)
await api.delete(`/tasks/${id}`);

// Assignee dropdown
const users = (await api.get('/users', { params: { is_active: 1, per_page: 100 } })).data.data;   // paginated: [{ id, name, email, role: {...} }]
```

**Values for dropdowns**

| Field | Values (send exactly) | Default |
|---|---|---|
| `status` | `todo`, `in_progress`, `done` | `todo` |
| `priority` | `low`, `medium`, `high` | `medium` |
| `sort` | `created_at`, `updated_at`, `due_date`, `title` (prefix `-` = descending) | `-created_at` |

**Task object fields to display:** `title`, `description`, `status`, `priority`, `due_date` (`YYYY-MM-DD`), `is_overdue` (true/false, good for a red badge), `completed_at`, `creator.name`, `assignee?.name` (null when unassigned), `created_at`.

## 6. Showing errors

Every error has the same shape:
```json
{ "error": { "code": "validation_error", "message": "The given data was invalid.",
             "details": { "title": ["The title field must be at least 3 characters."],
                          "due_date": ["The due date cannot be in the past."] } } }
```

```js
try {
  await api.post('/tasks', form);
} catch (err) {
  const e = err.response?.data?.error;
  if (err.response?.status === 422) {
    setFieldErrors(e.details);              // { field: [messages] } → show under each input
  } else {
    toast.error(e?.message ?? 'Something went wrong');
  }
}
```

| Status | What to do in the UI |
|---|---|
| 401 | Go to login (handled by the interceptor) |
| 403 | Toast `error.message` (e.g. "You can only delete tasks you created."). If `error.code === 'account_inactive'`, log the user out |
| 404 | "Task not found". It may have been deleted, so refresh the list |
| 422 | Show `error.details[field][0]` under each form field |
| 429 | "Too many requests", retry after `Retry-After` seconds |
| 500 | Generic error toast |

**Form rules (match them in the UI for instant feedback):**
- title: required, 3–255 chars
- description: max 5000
- due_date: today or later
- assigned_to: a user id, or `null` to unassign

### Showing/hiding actions with permissions

> **Current mode:** the backend does **not** enforce permissions right now (team decision, for CRUD testing). Every logged-in user can create, edit and delete everything, so you won't get 403s. The helpers below still work for hiding buttons if you want the UI ready for when enforcement is switched back on.

`login` and `/auth/me` return `user.permissions`, the user's effective rights (role + personal overrides). Use it to drive the UI; the API enforces the same rules anyway.

```js
const can = (module, action) => user.permissions?.[module]?.[action] === true;
const isSuperAdmin = user.role.slug === 'super_admin';

const canEdit   = (t) => isSuperAdmin || (can('tasks', 'update') && [t.created_by, t.assigned_to].includes(user.id));
const canDelete = (t) => isSuperAdmin || (can('tasks', 'delete') && t.created_by === user.id);

{can('tasks', 'create') && <NewTaskButton />}
{can('users', 'view')   && <NavLink to="/users">Users</NavLink>}
{isSuperAdmin           && <NavLink to="/roles">Roles & Permissions</NavLink>}
```
After an admin changes your role or permissions, call `/auth/me` again (e.g. on page focus) to refresh `permissions`.

### Admin screens (Super Admin)
| Screen | APIs |
|---|---|
| Users list / create / edit / deactivate | `GET/POST /users`, `PATCH /users/{id}` (`is_active: false`), `DELETE /users/{id}` |
| Role dropdown (user form, users filter) | `GET /roles/options`: `{id, name, slug, assignable}`. Disable or hide options with `assignable: false` |
| Roles & permission matrix | `GET /modules` (rows + action columns), `GET/POST/PATCH/DELETE /roles` |
| One user's personal overrides | `GET/PUT /users/{id}/permissions` (true / false / null = inherit) |

Request and response bodies: [API.md → Users / Roles](API.md).

## 7. Real-time updates (Socket.IO)

```js
import { io } from 'socket.io-client';

// 1. Get a short-lived (15 min) realtime token from Laravel (uses your session cookie).
const getToken = async () => (await api.post('/realtime/token')).data.data.token;

// 2. Connect (same origin: Vite proxies /socket.io to Node.js).
const socket = io({ auth: { token: await getToken() } });

// 3. Fresh token before every reconnect (the old one may have expired).
socket.io.on('reconnect_attempt', async () => { socket.auth = { token: await getToken() }; });
socket.on('connect_error', async (err) => {
  if (err.message === 'unauthenticated') { socket.auth = { token: await getToken() }; socket.connect(); }
});
```
Task events from Laravel carry a **small payload**: `{ taskId, assignedTo, title }` (`task.status_changed` adds `status` and `previousStatus`). To update the list, re-fetch the task with `GET /api/v1/tasks/{taskId}`, or remove it on `task.deleted`.

| Laravel event | Suggested UI action |
|---|---|
| `task.created`, `task.updated`, `task.status_changed` | `GET /tasks/{taskId}` and update the list |
| `task.assigned` | refresh the task; toast "Task assigned to you" if `assignedTo === me.id` |
| `task.deleted` | remove `taskId` from the list |

Every event also has `actorId`. If `actorId === me.id`, skip the toast: your own action already updated the screen. **The exact Socket.IO event names React receives are decided by Dev 3** (Node forwards them). See [NODE_INTEGRATION.md](NODE_INTEGRATION.md) for the full contract, including chat.

## 7b. Chat screens

| Screen | API |
|---|---|
| Chat list (sidebar) | `GET /api/v1/conversations` (use `name` and `lastMessage`) |
| Start a 1-to-1 chat | `POST /api/v1/conversations` `{ "type": "direct", "user_id": 3 }` (returns the existing chat if there is one) |
| New group | `POST /api/v1/conversations` `{ "type": "group", "title": "…", "member_ids": [2, 3] }` |
| Open a chat | `GET /api/v1/conversations/{id}/messages?limit=30`, then `?before_id=<meta.nextBeforeId>` when scrolling up |
| Send / typing / live messages | Socket.IO only (Dev 3: `conversation:join`, `chat:send`, `chat:message`) |
| Unread badge per chat | `unreadCount` on each conversation in `GET /api/v1/conversations` |
| Total chat badge | `GET /api/v1/conversations/unread-count` → `data.unread_count` (on load, reconnect, tab focus) |
| Opened / viewing a chat | `POST /api/v1/conversations/{id}/read` (also when a new message arrives while it's open) |
| Live badge updates | socket event from Node for `chat.unread_changed`: `{ conversationId, unreadCount, totalUnread, lastMessage? }`. `lastMessage` = toast/preview of a new message |

History messages have the same shape as the socket `chat:message` (`id, conversationId, senderId, message, createdAt`). Keep one list per conversation and de-duplicate by `id`. Map `senderId` to a name using the conversation `members`. Full details: [API.md → Chat](API.md).

## 7c. Notifications (bell + list)

| What | API |
|---|---|
| Badge on load, reconnect, tab focus | `GET /api/v1/notifications/unread-count` → `data.unread_count` |
| List | `GET /api/v1/notifications?per_page=20` (newest first, `?unread=1` for unread only). Item: `{ id, type, data: { title, message, task_id }, read_at, created_at }` |
| Mark one read | `POST /api/v1/notifications/{id}/read` (`id` = the socket `notification.id`) |
| Mark all read | `POST /api/v1/notifications/read-all` |

Live updates come from Node: `notification` (new item + `unreadCount`) and `notification:count` (badge changed in another tab). Laravel is the source of truth for the count; never send counts to the server. Use Dev 3's `useUnreadNotifications` hook (endpoint paths above).

## 8. Try the API before writing UI code

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@taskflow.test","password":"password"}'
```
Postman / Thunder Client / curl are not browsers: they get a **Bearer token** from the same login endpoint (`data.auth === "token"`). Send it as `Authorization: Bearer <token>`. That mode is only for testing tools; the React app always uses the cookie.
