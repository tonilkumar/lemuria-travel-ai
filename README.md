# Lemuria Travel AI — Phase 1

An AI-assisted travel CRM for Lemuria India Holidays. Not a CRUD app: a
workflow-driven operating system where **Lead → Customer → Quotation → Itinerary
→ Booking → Visa/Passport → Payment → Travel History** is one connected
lifecycle, and the same person stays one record however they reach us.

## Status

| Slice | State |
| --- | --- |
| Foundation (monorepo, DB, config, tooling) | **Shipped** |
| Authentication + RBAC | **Shipped** |
| Application shell + design system | **Shipped** |
| Dashboard (real Postgres aggregates) | **Shipped** |
| Leads & Follow-ups | **Shipped** |
| Customers 360 | **Shipped** |
| Document repository | **Shipped** |
| Lead → Customer conversion | **Shipped** |
| AI Quotation generator | **Shipped** |
| Itinerary / Visa / Passport | Schema + API surface ready, UI pending |
| Communication / Finance / Reports / LIA | Schema ready |

The database schema covers all 12 Phase 1 modules (57 tables) so migrations stay
coherent as later slices land. Navigation items for unshipped modules render
disabled and marked *Soon* rather than leading to a dead page.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite 6, TypeScript (strict), Tailwind v4, TanStack Query, React Router 7, Recharts |
| Backend | Node 20+, Fastify 5, TypeScript (strict), Zod |
| Database | PostgreSQL 17 via Drizzle ORM + drizzle-kit migrations |
| Jobs | BullMQ on Redis |
| Auth | JWT access tokens + rotating opaque refresh tokens, Argon2id hashing |
| Storage | Provider interface with local-disk and S3-compatible drivers |
| AI | Provider interface, Anthropic adapter, no-op default |
| PDF | PDFKit — real vector documents, no headless browser |

Rationale for each choice is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js 20.11+ (developed on 24)
- pnpm 9+
- Docker (for local Postgres and Redis)

## Install

```bash
pnpm install
```

## Configure

```bash
cp .env.example .env
```

Then generate real secrets — the API refuses to start in production with the
placeholder values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `PASSWORD_PEPPER` from that.
The API reads `apps/api/.env`; copy the root file there, or symlink it.

## Run

```bash
pnpm infra:up
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

- API — http://localhost:4000 (health at `/health`)
- Web — http://localhost:5300

> **Port note:** the web app runs on **5300**, not Vite's usual 5173. Windows
> reserves TCP 5162–5261 for Hyper-V/Docker (`netsh int ipv4 show
> excludedportrange protocol=tcp`), which silently swallows 5173 with an
> `EACCES` on bind.

## Seeded accounts

Password for all of them: `LemuriaDemo#2026`

| Role | Email |
| --- | --- |
| Admin | anitha@lemuriaholidays.test |
| Manager | ramesh@lemuriaholidays.test |
| Executive | divya@lemuriaholidays.test |
| Executive | karthik@lemuriaholidays.test |
| Operations | vinod@lemuriaholidays.test |
| Finance | lakshmi@lemuriaholidays.test |

Sign in as an executive and then as the admin to see RBAC working: the executive
sees only their own book of leads and gets a 403 on manager-only actions.

Seed data is deterministic — the same command produces the same dataset, so a
screenshot or bug report reproduces on another machine.

## Reset the database

```bash
pnpm --filter @lemuria/api db:reset
```

> Dropping only the `public` schema is not enough. Drizzle keeps its migration
> journal in a separate `drizzle` schema, so the next `db:migrate` would see the
> migration as already applied and silently no-op against an empty database.
> The `db:reset` script drops both.

## Test, typecheck, lint

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

## Migrations

Edit the schema under `apps/api/src/db/schema/`, then:

```bash
pnpm db:generate
```

Review the generated SQL in `apps/api/drizzle/` before committing it. The API
server never migrates on boot, so a rolling deploy cannot half-apply a schema
change — run `pnpm db:migrate` as an explicit deploy step.

## Layout

```
apps/
  api/                 Fastify REST API
    src/
      config/          Zod-validated environment
      db/schema/       Drizzle tables, one file per module
      db/seed/         Deterministic development data
      lib/             Errors, logging, audit, codes, security
      modules/<name>/  <name>.routes.ts + <name>.service.ts
      plugins/         Auth and error-handling Fastify plugins
  web/                 React SPA
    src/
      components/ui/     Design system primitives
      components/layout/ Application shell
      features/<name>/   Pages, hooks and API bindings per feature
      lib/               API client, formatting, utilities
packages/
  shared/              Zod contracts, domain enums, RBAC catalogue
```

Business rules live in services, never in routes or components. The frontend's
permission checks only hide UI — every rule is enforced again server-side.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure and the decisions behind it
- [DATABASE.md](docs/DATABASE.md) — schema, money handling, master data
- [API.md](docs/API.md) — conventions, envelope, error codes, endpoints
- [SECURITY.md](docs/SECURITY.md) — auth, RBAC, documents, audit
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) — environments and deploy steps
- [QUOTATIONS.md](docs/QUOTATIONS.md) — costing engine, tax configuration, approval
- [AI.md](docs/AI.md) — AI abstraction, governance, human approval
- [OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) — **six decisions needed from Lemuria**, GST first
