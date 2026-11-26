# TaskFlow — Frontend (Dev 1)

React frontend for **TaskFlow**, a real-time task manager. This folder is `frontend/` in the
unified team repo (`taskflow/frontend`). Frontend only — Laravel API (Dev 2) and Node.js
Socket.IO service (Dev 3) live in other folders.

Full plan and API contract: [PLAN.md](PLAN.md).

## Architecture

```
Browser ──> Nginx (this container, :80 → host :6001, all interfaces / LAN)
              ├── /            → static React build (SPA fallback to index.html)
              ├── /api/*       → laravel:8000        (REST, Bearer token)
              └── /socket.io/* → node-service:3000   (Socket.IO, websocket upgrade)
```

- The app always calls **relative** URLs (`/api`, `/socket.io`). Nginx (prod) or the Vite dev
  proxy (dev) routes them. Never hardcode `localhost:8000` in source.
- Laravel owns the data. The frontend never talks to PostgreSQL or Redis.
- Node.js (Dev 3) pushes `notification` events over Socket.IO (no `task.*` events). The
  app toasts them (`RealtimeNotifier`) and the dashboard re-reads the named task from Laravel.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite 7, React 19, JavaScript (JSX) |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` (tokens in `src/index.css` `@theme`) |
| Routing | `react-router` v7 (library mode) |
| HTTP | `axios` — single instance in `src/api/client.js` |
| Real-time | `socket.io-client` — single instance in `src/socket/socket.js` |
| Tests | Vitest + React Testing Library + jsdom |
| Serve | Nginx (`nginx.conf`), multi-stage `Dockerfile` |

## Commands

```bash
npm install
npm run dev        # Vite dev server on :5173, bound to 0.0.0.0 (LAN), proxies /api and /socket.io
npm run mock       # Mock Laravel + Socket.IO backend on :8000 (dev only)
npm run dev:mock   # both together
npm test           # Vitest, run once
npm run lint
npm run build      # outputs dist/
docker compose up -d --build   # → http://localhost:6001 and http://<LAN-IP>:6001
docker compose down
```

## Environment

All client vars must start with `VITE_` and are **baked in at build time** (Docker passes
them as build args). See `.env.example`.

| Var | Default | Purpose |
|---|---|---|
| `VITE_APP_NAME` | `TaskFlow` | Brand name in UI |
| `VITE_API_BASE_URL` | `/api` | axios baseURL |
| `VITE_SOCKET_URL` | *(empty = same origin)* | Socket.IO server URL |
| `VITE_SOCKET_PATH` | `/socket.io` | Socket.IO path |
| `DEV_API_TARGET` | `http://localhost:8000` | Vite dev proxy target for `/api` (not shipped to client) |
| `DEV_SOCKET_TARGET` | `http://localhost:3000` | Vite dev proxy target for `/socket.io` |

Read env only through `src/config/env.js`, never `import.meta.env` directly in components.

## Code rules

- `src/api/*` — one file per resource; functions return plain data (unwrapped from Laravel's
  `{ data: ... }`). Components never import axios directly.
- Errors: use `getErrorMessage(err)` / `getFieldErrors(err)` from `src/api/errors.js`
  (Laravel 422 shape: `{ message, errors: { field: [msg] } }`).
- Auth state lives in `AuthContext`; token in `localStorage` key `taskflow_token`.
  A 401 from any request clears the session and redirects to `/login`.
- Task list state goes through the pure reducer in `src/lib/tasksReducer.js` (REST results and
  socket events use the same actions, so duplicates are impossible).
- Socket connects only when logged in and disconnects on logout. Each handshake fetches a fresh
  realtime token (`POST /api/v1/realtime/token`, 15 min, never stored). `SocketProvider` reconnects
  after expiry (`io server disconnect` / auth `connect_error`) and signs out after 3 rejections.
- Socket code lives in `src/socket/`: `useSocketEvent`, `useConversation` (chat: join/rejoin, send with
  ack, typing), `usePresence`, `realtimeErrors.js` (code → message). Contract: PLAN.md §3.
- Keep components small; UI primitives in `src/components/ui/`.
- Accessibility: every input has a label, focus rings visible, modals trap Escape and restore focus.
- Responsive: verify at 375 / 768 / 1440 px.

## UI design system (approved baseline, 2026-11-26)

Keep future screens visually consistent with the current Tasks, Users, Roles and auth pages.
Do not replace this with a generic dashboard theme or re-introduce oversized presentation typography.

- **Direction:** operational command center: off-white paper, near-black graphite, white surfaces and
  lime as the single live/success signal. Use the Tailwind tokens in `src/index.css`; do not scatter
  new hard-coded brand colours through components.
- **Type:** Schibsted Grotesk. Authenticated page headlines use
  `clamp(2.35rem, 4.2vw, 4.5rem)` (about 37.6 px mobile / 60.5 px at 1440 px). Secondary section
  titles are `text-2xl sm:text-3xl`. Large numbers may be display-sized; ordinary labels and body
  copy remain compact. Avoid the old 7-9rem page headings.
- **Layout:** use `Page wide` (`max-width: 1600px`) for Tasks, Users and Roles. Bento cards use
  1.5-1.75rem radii, tight 0.75rem gaps and content-driven heights. Mobile cards must collapse to a
  dense single column with no horizontal overflow.
- **Motion:** use `framer-motion` springs for page reveals, shared-layout navigation, card hover/tap
  feedback and meaningful workflow transitions. Always respect `useReducedMotion`; avoid motion that
  changes data or interrupts form entry.
- **Navigation:** `AppHeader` owns the spring-animated active pill for Tasks / Users / Roles. Preserve
  keyboard focus and active-route semantics.
- **Auth:** `AuthLayout` uses the interactive, code-native `WorkflowIllustration` on desktop and a
  clean single-viewport form on mobile. Keep the illustration relevant to TaskFlow; do not substitute
  a stock hero image.
- **Tasks:** the overview contains the focus card, real-data `TeamWorkflowIllustration`, status cards
  and live queue. Do **not** add standalone Due Today or Overdue summary cards. Due-date metadata may
  remain on individual tasks and in the task form.
- **Users / Roles:** keep the compact access metrics, card/list hierarchy, role chips and spring hover
  feedback. Create/edit pages share the rounded `FormSection` and pill-shaped actions.
- **QA:** after visual changes, verify 375 / 768 / 1440 px, zero horizontal overflow, reduced motion,
  keyboard operation, `npm test`, `npm run lint` and `npm run build`.

## Users & roles master (Phase 2)

- **No permissions module** (user decision 2026-11-26). Modules: Tasks, Users, Roles master.
- Routes: `/users`, `/users/new`, `/users/:id/edit`, `/roles`, `/roles/new`, `/roles/:id/edit`,
  all under `AppLayout` (header + nav). No UI permission guards; a backend 403 shows `ForbiddenState`.
- API: `src/api/access.js` (`usersApi`, `rolesApi`) built on `createResource()` in
  `src/api/resource.js`. Lists return `{ items, meta }` via `unwrapPage`. Role body: `{ name, description }`;
  user body has **`role_id`** (one role per user, required by the backend; `toUserPayload()`).
- Data loading: `useFetch(fn, deps)`; forms: `useForm()` (maps backend 422 onto fields).
- Contract is **proposed** (PLAN.md Phase 2, P2.1). Backend routes didn't exist on 2026-11-26.
- Mock logins (password `password`): `demo@` admin, `sam@` manager, `priya@` member
  (all `@taskflow.dev`).

## Chat (Phase 3)

- `/chat`, `/chat/:conversationId` → `src/pages/chat/ChatPage.jsx`, components in `src/components/chat/`.
- History/conversations: `src/api/chat.js` (REST contract **proposed**, PLAN.md P3.1, 404 on 2026-11-26).
  Live: `useConversation()`. Messages are merged by id (`mergeMessages`); never add a message from the
  `chat:send` reply, only from `chat:message`.
- Mock chat: General (everyone), Managers (Sam only → denied for others), Demo↔Priya direct.

## Auth & cookies (checked against the backend 2026-11-26)

- **Backend switched to Sanctum session auth (2026-11-26).** Login returns
  `{ message, data: { auth: "session", user } }`, no token; rate-limited to 5/min.
  `user` has a single `role: { id, name, slug }` + `role_id` (read via `rolesOf()` in `src/lib/roles.js`).
- `/sanctum/csrf-cookie` exists and sets `taskflow-session` (**HttpOnly**, SameSite=Lax, no
  Secure) + `XSRF-TOKEN` (readable by JS by design). So Sanctum SPA cookie auth is available.
- Cookies are host-only (no `Domain`), so they work through the Vite / Nginx proxy as-is.
- axios (`src/api/client.js`) always uses `baseURL: '/api/v1'`, `withCredentials: true`,
  `withXSRFToken: true`, in both modes.
- **`VITE_AUTH_MODE`** picks the login mode (build-time):
  - `cookie` (**default**, what the backend uses): Sanctum SPA. `GET /sanctum/csrf-cookie` before login/register, no token in JS, session restored by calling `/auth/me`
    on load, 419 → refresh CSRF cookie and retry once, socket authenticates with the cookie
    (no `auth.token`). `/sanctum/*` is proxied by Vite and Nginx.
  - `token`: old Bearer token in `localStorage` (`taskflow_token`). Login fails with
    "The server did not return an access token." against the session backend.
- Switch **both sides together**: once Dev 2 marks our origin stateful, token-mode POSTs get 419.
- Backend needs for cookie mode: `SANCTUM_STATEFUL_DOMAINS` listing every frontend host:port
  (`localhost:5173`, `192.168.1.64:5173`, `<LAN-IP>:6001`…), `statefulApi()`, session login
  (`Auth::guard('web')->attempt` + `session()->regenerate()`), `SESSION_DOMAIN=null`, no
  `Secure` on plain http. Dev 3's socket service must read the `taskflow-session` cookie.
- The mock supports both modes: `VITE_AUTH_MODE=cookie npm run dev:mock`.

## Gotchas (verified)

- **Browser testing:** signing in with a common password (`password`, `welcome123`) can make
  Chrome open its "password found in a data breach" popup. It's outside the page, invisible
  to scripts, and swallows **all** clicks and keys, so tests look like "the button does nothing".
  Restart the browser, and use non-leaked passwords in test data.

- **Git Bash + Vitest:** `cd /e/TEAM_CLIENT` gives Node a lowercase `e:\` cwd and Vitest 5
  fails every suite with `Cannot read properties of undefined (reading 'config')`.
  Use `cd E:/TEAM_CLIENT` (or PowerShell / cmd). Not a code bug.
- **Git Bash + Docker:** prefix `MSYS_NO_PATHCONV=1` when passing container paths like `-w /app`.
- **Vitest hooks:** `beforeEach(() => fn.mockReset())` returns the mock, and Vitest runs a
  returned function as teardown. Use a block body `beforeEach(() => { ... })`.
- **Port 5173** may be taken by another local project; Vite then picks the next free port.
  Use the `Network:` URL Vite prints to share on the LAN.
- **Never use port 6000** for the frontend: Chrome/Firefox block it (`ERR_UNSAFE_PORT`).
  Docker host port is **6001** (`FRONTEND_PORT`). Also blocked: 6665-6669, 10080.
- Docker network is named **`app_network`** (fixed `name:` in `docker-compose.yml`) so the
  Laravel and Node.js compose files can join it.
- Nginx on Docker's *default* bridge has no DNS (`127.0.0.11`), so `/api` gives 502 when the
  frontend container runs alone. That's expected; inside compose's network it resolves.
- A notification about your own change can come back over the socket. `markOwnTask(id)`
  (`src/socket/ownChanges.js`) before/after a mutation suppresses that toast; keep it if you refactor.
- The Node socket server rejects bad tokens with `connect_error.data.code` and then does **not**
  auto-reconnect (`socket.active === false`); that's why `SocketProvider` reconnects by hand.
- Mock: `MOCK_REALTIME_TTL_MS=20000 npm run mock` makes realtime tokens expire fast to test reconnects.

## Contract changes

The API and socket contract in PLAN.md §3 is shared with Dev 2 and Dev 3. Change it there
first and tell them — don't silently diverge in code.
