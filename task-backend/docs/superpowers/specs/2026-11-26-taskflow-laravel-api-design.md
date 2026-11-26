# TaskFlow — Laravel API (Dev 2) — Design

**Status:** approved 2026-11-26

## Intent
Laravel is the only service that owns the data in TaskFlow. React calls it over REST through the Nginx gateway (`/api/*`). Node.js receives task events through Redis Pub/Sub and pushes them to React over Socket.IO. This module must be clean and professional, with correct validation, auth, status codes and a properly built PostgreSQL schema.

## Goals
- Sanctum Bearer-token auth: `POST /api/v1/auth/login` (rate-limited), `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Seeded users (1 admin, 2 members). No public registration.
- Task CRUD on `/api/v1/tasks`, with pagination, filters (status, priority, assigned_to, created_by, due range, search) and sorting.
- `GET /api/v1/users` for the assignee picker.
- One JSON shape for every success and error response, with correct HTTP status codes.
- Publish `task.created`, `task.updated` and `task.deleted` to the Redis channel `taskflow:tasks` after the DB commit.
- CORS origins configured from `.env`.
- Multi-stage Dockerfile, plus a local compose file (app + Postgres 17 + Redis 7).
- Feature tests on real PostgreSQL. API contract doc for Dev 1 and Dev 3.

## Non-goals
Registration, password reset, email verification, Laravel Broadcasting, and WebSocket handling (Node owns that).

## Anti-goals
- Node.js touching Postgres.
- A Redis outage breaking task writes. Publishing is best-effort and logged.
- Leaking stack traces or SQL in responses when `APP_DEBUG=false`.

## Decisions
| Area | Decision |
|---|---|
| Auth | Sanctum personal access tokens, `Authorization: Bearer`, expiry from `SANCTUM_TOKEN_EXPIRATION` (minutes) |
| Authorization | Any authenticated user can view or update tasks. Delete: only the creator or an admin (403 otherwise) |
| Enums | PHP backed enums. Columns are `varchar` + CHECK (Laravel `enum()` on pgsql), not `CREATE TYPE`, so the values can change later |
| Timestamps | `timestamptz` everywhere (`timestampsTz`, `softDeletesTz`) |
| Emails | Stored lowercased, plus a unique index on `lower(email)` |
| FKs | `tasks.created_by` → users RESTRICT, `tasks.assigned_to` → users SET NULL. Both indexed |
| Redis client | `predis` (no PHP extension needed). Dedicated `events` connection with an empty key prefix, so the channel name is exact |
| Errors | `{"error":{"code","message","details?"}}` |
| Success | `{"data":…, "meta"?, "links"?, "message"?}` |

## Approaches considered
1. **Sanctum tokens + Form Requests + API Resources + Observer → Redis publisher (chosen).** Laravel-native, easy for the team to read, and the event contract lives in one class.
2. JWT (tymon/jwt-auth): stateless, but adds a third-party package for no gain, since Node can validate tokens through `/auth/me`.
3. Laravel Broadcasting to Redis: ties the payload to Laravel's broadcast envelope, which Node would have to unwrap. A plain `PUBLISH` gives a cleaner contract.

## Addendum 2026-11-26 — Role & permission tables (approved)

- `roles` (super_admin, user seeded as system roles). New roles go through the API, Super Admin only.
- `users.role_id` FK → roles (RESTRICT). Users are soft-deleted and have an `is_active` flag.
- `modules` (tasks, users) + `role_permissions` (role × module × view/create/update/delete, `updated_by` audit).
- `user_permissions`: per-user overrides; NULL = inherit. Effective = override → role → false.
- Super Admin bypasses all checks (`Gate::before`) and is the only one who manages roles, permissions and overrides, or assigns the Super Admin role.
- Ownership on top of permissions: task update = creator/assignee, task delete = creator.
- Safety rules (409): no self role-change/deactivate/delete, keep the last active Super Admin, no deleting system roles or roles that still have users.
- Seeders are create-only, so changes made through the API survive container restarts.
- Applied as a clean migration rewrite + `migrate:fresh --seed` (user's choice; no other database had the old schema).

## Addendum 2026-11-26 — Permission enforcement removed (team decision, for CRUD testing)

- All `Gate::authorize` calls, FormRequest checks, `Gate::before` and the three policies (Task/User/Role) were removed. Any logged-in user can do full CRUD.
- Kept: login (`auth:sanctum` + `active`), validation, the data-safety 409 rules, the roles/permissions tables and APIs, and `/auth/me → permissions`.
- Restoring enforcement means re-adding the policies and checks (the earlier design above). Note: with no checks, any user can create a Super Admin account.
