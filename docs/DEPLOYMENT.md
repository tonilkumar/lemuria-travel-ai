# Deployment

The application is cloud-agnostic and deploys to Lemuria's own account. It needs
three things from the platform: a Node 20+ runtime, managed PostgreSQL 17, and
managed Redis. Object storage is either the platform's S3-compatible service or
the local-disk driver for a single-node install.

## Environments

| Environment | Purpose | Data |
| --- | --- | --- |
| Development | Local. Docker Postgres + Redis. | Seed data |
| UAT | Client acceptance. Mirrors production topology. | Anonymised copy |
| Production | Live. | Real |

Each keeps its own database, Redis, storage bucket and secret set. Nothing is
shared across environments — a UAT job must never be able to message a real
customer.

## Build

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm build
```

- `apps/api` compiles to `apps/api/dist`, run with `node --env-file=.env dist/index.js`.
- `apps/web` emits static assets to `apps/web/dist`.

## Serving

Put the API and the built SPA behind **one origin**. The SPA calls `/api/v1`
same-origin, which keeps the refresh cookie first-party and avoids CORS
entirely. A reverse proxy routing `/api` to the API and everything else to the
static bundle (with SPA fallback to `index.html`) is all that is required.

Terminate TLS at the proxy and set `trustProxy` — already enabled when
`NODE_ENV=production` — so rate limiting and audit logs record the real client
IP rather than the proxy's.

## Migrations

Run as an **explicit deploy step**, before the new API starts:

```bash
pnpm --filter @lemuria/api db:migrate
```

The server never migrates on boot, so a rolling deploy cannot half-apply a
schema change with two versions running at once.

Migrations are forward-only. To reverse one, write a new migration.

Verify after deploying that the migration actually applied — a migration bundled
in an artifact is not the same as a migration applied to the database. A service
can start healthy and then fail on the first query that touches a missing
column.

## Configuration

Supply environment variables from the platform's secret manager, not from a file
in the image. `.env.example` lists everything.

The API validates its whole environment at startup and exits with a readable
list of problems if anything is missing. In production it additionally refuses
to start if the JWT secrets or password pepper still hold placeholder values.

## Background jobs

The BullMQ worker runs in the same process by default. Under load, run it as a
separate deployment against the same Redis — it is the same image with a
different entrypoint. Scheduled work includes follow-up reminders, marking
follow-ups overdue, passport and visa expiry alerts, and scheduled sends.

Exactly one instance should own the repeatable-job schedule; extra API replicas
must not each register the same cron.

## Backups

Daily automated backups of PostgreSQL with point-in-time recovery, retained per
the client's policy. Object storage needs versioning enabled so a deleted
passport scan is recoverable.

**Test the restore.** An untested backup is not a backup.

## Health and observability

`GET /health` is unauthenticated and exempt from rate limiting — point the load
balancer at it. Logs are structured JSON on stdout with a `requestId` on every
line, so a user-reported error reference resolves directly to its request.

A meaningful webhook or health check verifies the **response body**, not just
that a status code came back. An endpoint returning 401 is answering — that is
not the same as working.

## Rollback

Application rollback is redeploying the previous artifact. Database rollback is
not automatic: if a release included a destructive migration, restore from
backup. Prefer additive migrations (add a column, backfill, switch reads, drop
later in a separate release) so that rollback stays a non-event.
