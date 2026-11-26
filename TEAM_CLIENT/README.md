# TaskFlow — Frontend

React dashboard for TaskFlow: sign in, create and manage tasks, and see teammates' changes live
over Socket.IO. Served by Nginx, which also routes `/api` to Laravel and `/socket.io` to the
Node.js service.

## Run locally

```bash
npm install
cp .env.example .env        # defaults work as-is
```

**Without the backend** (mock API + socket on :8000):

```bash
npm run dev:mock
# open the URL Vite prints (usually http://localhost:5173)
# sign in: demo@taskflow.dev / password
```

**Share on your local network:** the dev server listens on all interfaces. Vite prints a
`Network:` line, e.g. `http://192.168.1.64:5173/`. Teammates on the same Wi-Fi/LAN open that.
Set `DEV_HOST=localhost` in `.env` to keep it on your machine only.

Set `MOCK_SIMULATE=1` to have a fake teammate change a task every 15 seconds.

**With the real backend** (Laravel on :8000, Node.js on :3000):

```bash
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, proxies `/api` → `DEV_API_TARGET`, `/socket.io` → `DEV_SOCKET_TARGET` |
| `npm run dev:mock` | Mock backend + Vite together |
| `npm test` | Unit and component tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run build` | Production build to `dist/` |

## Docker

```bash
docker compose up -d --build     # http://localhost:6001  and  http://<your-LAN-IP>:6001
docker compose logs -f frontend
docker compose down
```

- Host port is **6001** (change with `FRONTEND_PORT` in `.env`). Port 6000 is avoided on
  purpose: Chrome and Firefox block it (`ERR_UNSAFE_PORT`).
- The port is published on all interfaces, so anyone on your LAN can open it.
- The container joins the Docker network **`app_network`**.
- Health check: `GET /healthz` → `ok`.

Find your LAN IP with `ipconfig` (Windows, "IPv4 Address" under Wi-Fi/Ethernet). If
teammates can't connect, allow the port in Windows Firewall (admin PowerShell):

```powershell
New-NetFirewallRule -DisplayName "TaskFlow frontend 6001" -Direction Inbound -Protocol TCP -LocalPort 6001 -Action Allow
```

`VITE_*` values are compiled into the bundle, so pass them as build args:

```bash
docker build --build-arg VITE_API_BASE_URL=/api --build-arg VITE_SOCKET_PATH=/socket.io -t taskflow-frontend .
```

### docker-compose (frontend + Node)

The repo root has `docker-compose.yml` running this frontend and `task-node` together
(`cp .env.example .env`, `cp task-node/.env.example task-node/.env`, then `docker compose up -d --build`).

Nginx's upstreams come from the environment (`nginx.conf` is an nginx-image template):

| Var | Default | Use |
|---|---|---|
| `LARAVEL_UPSTREAM` | `http://laravel:8000` | Laravel service on `app_network`, or a LAN address (`http://192.168.1.37:8000`) |
| `SOCKET_UPSTREAM` | `http://node-service:3000` | Node realtime service |

Laravel must list the frontend's `host:port` (e.g. `localhost:6001`, `<LAN-IP>:6001`) in
`SANCTUM_STATEFUL_DOMAINS`, or cookie sign-in fails.

## Backend contract

Endpoints, payloads and socket events are in [PLAN.md §3](PLAN.md#3-api--socket-contract-shared-with-dev-2--dev-3).
Summary:

- `POST /api/v1/auth/login`, `POST /api/v1/auth/register` → `{ user, token }` (token mode)
- `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- `GET|POST /api/v1/tasks`, `PUT|DELETE /api/v1/tasks/{id}`
- Socket.IO (Node, `DEV_SOCKET_TARGET`, dev: `http://192.168.1.222:3000`) authenticates with a
  15-minute token from `POST /api/v1/realtime/token`, fetched fresh on every connect. Events:
  `notification`, `chat:message`, `typing:*`, `presence:update`, `chat:error` (PLAN.md §3).

## Cookie auth (HttpOnly)

`VITE_AUTH_MODE` in `.env` chooses how the app stays signed in:

| Mode | How | Status |
|---|---|---|
| `cookie` (default) | Laravel Sanctum SPA: HttpOnly `taskflow-session` cookie, JS never sees it | What the backend uses (since 2026-11-26) |
| `token` | Bearer token in `localStorage` | Old mode; the backend no longer returns a token |

Cookie mode flow: `GET /sanctum/csrf-cookie` → `POST /api/v1/auth/login` (with `X-XSRF-TOKEN`)
→ `GET /api/v1/auth/me` to confirm the browser kept the cookie. On reload the app calls
`/auth/me`; 401 = signed out. A 419 (CSRF expired) refreshes the cookie and retries once.

**Backend checklist (Dev 2)** before we switch:

1. `SANCTUM_STATEFUL_DOMAINS` lists every address the frontend is opened on, with port:
   `localhost:5173,192.168.1.64:5173,localhost:6001,<LAN-IP>:6001`.
2. `$middleware->statefulApi()` in `bootstrap/app.php`.
3. Login uses the session: `Auth::guard('web')->attempt(...)` + `$request->session()->regenerate()`;
   logout invalidates the session. Returning a token too is fine; cookie mode ignores it.
4. `SESSION_DOMAIN=null` (host-only cookie, as now) and `SESSION_SECURE_COOKIE=false` while on http.
5. No CORS change needed: the browser only talks to our own origin (Vite / Nginx proxy).

**Socket (Dev 3):** in cookie mode the client sends no token. The handshake carries the
`taskflow-session` cookie, so the Node service must validate it (e.g. call Laravel
`GET /api/v1/auth/me` with that cookie).

**Switch both sides at the same time.** Once our origin is stateful, token-mode POSTs fail with
419. To switch: set `VITE_AUTH_MODE=cookie` in `.env` and restart `npm run dev` (Docker: rebuild).
Try it now against the mock: `VITE_AUTH_MODE=cookie npm run dev:mock`.
