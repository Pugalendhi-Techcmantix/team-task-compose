# TaskFlow — Laravel API (Backend)

The Laravel 12 REST API for TaskFlow. **Laravel owns the data**: it is the only service that reads and writes PostgreSQL. After each task change it publishes an event to Redis, and the Node.js real-time service pushes that event to React over Socket.IO.

```
React ──REST──▶ Nginx (/api/*) ──▶ Laravel ──▶ PostgreSQL
                                     │
                                     └─PUBLISH taskflow:tasks──▶ Redis ──▶ Node.js ──Socket.IO──▶ React
```

- **API contract** (endpoints, validation, error codes, Redis event format): [docs/API.md](docs/API.md)
- **Team handoff, step by step (start here)**: [docs/TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md)
- **React handoff** (axios setup, auth, tasks, errors, Socket.IO): [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md)
- **Node.js handoff** (Redis events, socket auth, network, testing): [docs/NODE_INTEGRATION.md](docs/NODE_INTEGRATION.md)
- Design notes: [docs/superpowers/specs/2026-11-26-taskflow-laravel-api-design.md](docs/superpowers/specs/2026-11-26-taskflow-laravel-api-design.md)

## Run with Docker (recommended)

```bash
cp .env.example .env
php artisan key:generate          # or: docker run --rm -v "$PWD":/app -w /app php:8.3-cli php artisan key:generate
docker compose up -d --build
curl http://localhost:8000/api/health
```
On start the container runs migrations, plus the idempotent seeders when `RUN_SEEDERS=true`. Log in as `admin@taskflow.test` / `password`.

| Service | Host port | Notes |
|---|---|---|
| laravel | `APP_PORT` (8000) | PHP-FPM + Nginx, non-root, healthcheck on `/api/health` |
| postgres | `127.0.0.1:DB_FORWARD_PORT` (5432) | Postgres 17, reachable only from this PC; also creates `taskflow_test` on first start |
| redis | `REDIS_FORWARD_PORT` (6379) | Redis 7, AOF on, password + ACL: `default` (Laravel) and subscribe-only `taskflow_node` (Node.js) |

If 5432 is already in use on your machine, set `DB_FORWARD_PORT` **and** `DB_PORT` in `.env` to a free port (e.g. 55432).

## Run locally (PHP on the host, DB + Redis in Docker)

```bash
composer install
docker compose up -d postgres redis
php artisan migrate --seed
php artisan serve --port=8000
```
Needs the PHP extension `pdo_pgsql`. Redis uses `predis`, so no PHP extension is needed for it.

## Tests

The tests run against a real PostgreSQL database (`taskflow_test`), never SQLite:
```bash
docker compose up -d postgres
php artisan test
```
Coverage: auth (login, case-insensitive email, throttling, expiry, logout), every task endpoint and status code, validation, policy (403), soft delete (404), CORS, malformed JSON, the Redis event contract, and a Redis outage.

## Database schema

| Table | Key points |
|---|---|
| `roles` | `id` identity; `name` (unique, case-insensitive), `slug` (unique, CHECK format), `is_system` |
| `users` | `role_id` FK → roles (RESTRICT); `is_active`; soft deletes; unique `LOWER(email)` among non-deleted users; timestamptz |
| `modules` | Protected areas: `tasks`, `users` (unique `key`) |
| `role_permissions` | role × module → `can_view`, `can_create`, `can_update`, `can_delete`; `updated_by` audit FK; unique (role_id, module_id) |
| `user_permissions` | Per-user overrides (NULL = inherit); CHECK at least one non-NULL; unique (user_id, module_id) |
| `conversations` | `type` CHECK (`direct`, `group`); groups must have a title (CHECK); `last_message_at` for "recent chats" |
| `conversation_members` | composite PK (conversation_id, user_id); index on user_id |
| `messages` | `sender_id` FK RESTRICT (users are soft-deleted); CHECK body not blank and ≤ 5000 chars; index (conversation_id, id) for history |
| `tasks` | `id` identity; `status` CHECK (`todo`, `in_progress`, `done`); `priority` CHECK (`low`, `medium`, `high`); `created_by` FK RESTRICT; `assigned_to` FK SET NULL; CHECK `title` not blank; CHECK `completed_at` set ⇔ `status = done`; soft deletes; indexes on `created_by`, `(assigned_to, status)`, `status`, `due_date`, `created_at` |
| `personal_access_tokens` | Sanctum Bearer tokens (hashed), with `expires_at` |

## Project layout

```
app/
  Contracts/TaskEventPublisher.php       event contract (task.created|updated|deleted)
  Enums/                                 TaskStatus, TaskPriority, UserRole
  Exceptions/ApiExceptionRenderer.php    every error → {"error":{code,message,details?}}
  Http/Controllers/Api/V1/               Auth, Task, User controllers (thin)
  Http/Middleware/ForceJsonResponse.php  JSON always; malformed body → 400
  Http/Requests/                         all validation (Form Requests)
  Http/Resources/                        output shape (API Resources)
  Observers/TaskObserver.php             publishes after DB commit
  Policies/TaskPolicy.php                delete = creator or admin
  Services/RedisTaskEventPublisher.php   Redis PUBLISH, never throws
docker/                                  nginx, php-fpm, supervisord, entrypoint, pg init
Dockerfile                               multi-stage: composer deps → php-fpm-alpine runtime
compose.yaml                             laravel + postgres + redis (Dev 2 local stack)
```

## Main environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:8080` | Comma-separated browser origins allowed to call `/api/*` |
| `SANCTUM_TOKEN_EXPIRATION` | `1440` | Bearer token lifetime in minutes (Postman / Node) |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost:8080,…` | Browser origins (host:port) that log in with the HttpOnly session cookie |
| `SESSION_DRIVER` / `SESSION_LIFETIME` | `redis` / `120` | Browser session store and idle timeout (minutes) |
| `SESSION_SECURE_COOKIE` | `false` | Set `true` when served over HTTPS |
| `REDIS_EVENTS_CHANNEL` | `taskflow:tasks` | Pub/Sub channel Node.js subscribes to |
| `SEED_DEFAULT_PASSWORD` | `password` | Password for the seeded users |
| `RUN_MIGRATIONS` / `RUN_SEEDERS` | `true` / `false` | What the container runs on start |
| `TRUSTED_PROXIES` | private ranges | Proxies whose `X-Forwarded-*` headers are trusted |

## For Dev 3: merging into the root compose file

Copy the `laravel` service from `compose.yaml`, with `build.context: ./laravel` and the same `environment`. Then point the gateway at it:
```nginx
location /api/ { proxy_pass http://laravel:8000; proxy_set_header Host $host;
                 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                 proxy_set_header X-Forwarded-Proto $scheme; }
```
Set `CORS_ALLOWED_ORIGINS` to the origin the browser actually uses (for example `http://localhost:8080`).
