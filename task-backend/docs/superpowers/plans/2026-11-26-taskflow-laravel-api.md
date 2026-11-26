# TaskFlow Laravel API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production-quality Laravel 12 REST API for TaskFlow (auth, users, tasks, Redis events), plus Docker.

**Architecture:** Versioned `/api/v1` routes → Form Requests (validation) → thin controllers → Eloquent + Policies → API Resources. A `TaskObserver` (after-commit) calls a `TaskEventPublisher` contract, and the Redis implementation publishes JSON to `taskflow:tasks`. A global exception handler maps every error to one JSON envelope.

**Tech Stack:** PHP 8.2+ (8.3 in Docker), Laravel 12, Sanctum 4, predis, PostgreSQL 17, Redis 7, PHPUnit 11.

**Spec:** `docs/superpowers/specs/2026-11-26-taskflow-laravel-api-design.md`

## Global Constraints
- No SQLite anywhere: app and tests use `pgsql` (tests use DB `taskflow_test`).
- All timestamps are `timestamptz`. JSON dates are ISO-8601 (`toIso8601String`). `due_date` is `Y-m-d`.
- Errors always look like `{"error":{"code":string,"message":string,"details"?:object}}`.
- Enum values: status `todo|in_progress|done`, priority `low|medium|high`, role `admin|member`.
- Redis channel `taskflow:tasks`, payload `{event, occurred_at, actor_id, data}`.

## Review Focus
1. Malformed JSON body → 400 `invalid_json`, not 500 and not a misleading 422.
2. A soft-deleted or nonexistent task id → 404 `not_found` (including `/tasks/abc` → 404).
3. Redis down during create → task still saved, 201 returned, error logged.
4. Login with a different-case email (`ADMIN@…`) → succeeds; 6th bad attempt in a minute → 429.
5. `per_page=1000` or `sort=password` → 422, never passed raw into SQL.

---

### Task 1: Platform setup
**Files:** `composer.json`, `.env`, `.env.example`, `phpunit.xml`, `config/cors.php`, `config/database.php`, `config/sanctum.php`, `routes/api.php`, `bootstrap/app.php`
- [ ] `composer require laravel/sanctum predis/predis`, `php artisan install:api` (Sanctum migration + `routes/api.php`), `php artisan config:publish cors`
- [ ] `.env`/`.env.example` → pgsql, redis cache/queue, `REDIS_CLIENT=predis`, `CORS_ALLOWED_ORIGINS`, `SANCTUM_TOKEN_EXPIRATION`
- [ ] `config/database.php`: add redis connection `events` with `options.prefix = ''`
- [ ] `phpunit.xml`: `DB_CONNECTION=pgsql`, `DB_DATABASE=taskflow_test`
- [ ] Verify: `php artisan about` shows the pgsql + redis drivers

### Task 2: Schema + models + enums
**Files:** `database/migrations/0001_01_01_000000_create_users_table.php` (modify), `…_create_tasks_table.php`, `app/Enums/{TaskStatus,TaskPriority,UserRole}.php`, `app/Models/{User,Task}.php`, factories
- users: `role` enum default `member`, `timestampsTz`, unique index `users_email_lower_unique` on `lower(email)` (pgsql only)
- tasks: `id`, `title` string(255), `description` text null, `status` enum default `todo`, `priority` enum default `medium`, `due_date` date null, `completed_at` timestamptz null, `created_by` FK restrict, `assigned_to` FK null-on-delete, `timestampsTz`, `softDeletesTz`; indexes `(status)`, `(assigned_to, status)`, `(created_by)`, `(due_date)`, `(created_at)`
- `Task::saving` sets `completed_at` when status becomes `done` and clears it otherwise
- [ ] Verify: `php artisan migrate:fresh` on Postgres; `\d tasks` shows the CHECKs and indexes

### Task 3: Error envelope + JSON enforcement
**Files:** `app/Http/Middleware/ForceJsonResponse.php`, `bootstrap/app.php`
- Middleware: sets `Accept: application/json`; a JSON content-type with an invalid body → 400 `invalid_json`
- Handler maps: ValidationException 422 `validation_error` (details = field → messages), AuthenticationException 401 `unauthenticated`, AuthorizationException/AccessDenied 403 `forbidden`, ModelNotFound/NotFoundHttp 404 `not_found`, MethodNotAllowed 405, ThrottleRequests 429 `too_many_requests` (+Retry-After), other HttpException → its status, Throwable → 500 `server_error` (message hidden unless debug)
- Tests: `tests/Feature/ErrorHandlingTest.php`: unknown route 404 envelope, malformed JSON 400, no token 401

### Task 4: Auth
**Files:** `app/Http/Controllers/Api/V1/AuthController.php`, `app/Http/Requests/Auth/LoginRequest.php`, `app/Http/Resources/UserResource.php`, `app/Providers/AppServiceProvider.php` (rate limiters)
- `login`: 200 `{data:{token, token_type:"Bearer", expires_at, user}}`; bad creds 401 `invalid_credentials`; limiter `login` 5/min per lower(email)+ip
- `logout`: deletes the current token, 204. `me`: 200 user
- Tests `tests/Feature/Auth/AuthTest.php`: success, case-insensitive email, wrong password 401, validation 422, throttle 429, logout revokes the token (then 401), me without token 401

### Task 5: Tasks API
**Files:** `TaskController`, `UserController`, `Requests/Task/{IndexTaskRequest,StoreTaskRequest,UpdateTaskRequest}`, `Resources/TaskResource`, `Policies/TaskPolicy`
- Store rules: title required 3–255; description ≤5000; status/priority enum; due_date `Y-m-d` ≥ today; assigned_to exists:users,id. Update = same with `sometimes`; title cannot be null
- Index: filters + `sort` ∈ {created_at, updated_at, due_date, title} with optional `-`; `per_page` 1–100 (default 15); search escaped `whereLike`
- store 201 + `Location`; update 200; destroy 204 (soft delete); policy delete = creator or admin
- Tests `tests/Feature/Tasks/TaskApiTest.php`: every status code + filters + 403 + 404 + soft delete

### Task 6: Redis events
**Files:** `app/Contracts/TaskEventPublisher.php`, `app/Services/RedisTaskEventPublisher.php`, `app/Observers/TaskObserver.php` (`ShouldHandleEventsAfterCommit`)
- Publisher failure → `Log::error`, never thrown
- Tests: fake publisher records events for create/update/delete; Redis exception does not break 201

### Task 7: Seeder, Docker, docs
**Files:** `database/seeders/{DatabaseSeeder,UserSeeder,TaskSeeder}.php`, `Dockerfile`, `docker/{nginx.conf,supervisord.conf,php.ini,entrypoint.sh}`, `docker/postgres/init-test-db.sql`, `docker-compose.yml`, `.dockerignore`, `docs/API.md`, `README.md`
- Seeders are idempotent (`updateOrCreate`). Passwords come from `SEED_DEFAULT_PASSWORD` (default `password`)
- Image: composer stage → php:8.3-fpm-alpine + nginx + supervisord, port 8000, non-root, `/api/health` healthcheck (DB + Redis → 200/503)
- Verify: `docker compose up -d --build`, login via curl through port 8000, `redis-cli SUBSCRIBE taskflow:tasks` receives `task.created`
