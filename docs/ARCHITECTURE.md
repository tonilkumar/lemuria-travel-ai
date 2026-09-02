# Architecture

## Shape

```
React SPA (Vite)
      |  same-origin /api  (cookies stay first-party, no CORS pre-flight)
      v
Fastify REST API  --  authenticate -> authorize -> route -> service -> Drizzle
      |                                                        |
      |                                                        v
      |                                                  PostgreSQL 17
      +--> BullMQ / Redis (reminders, expiry alerts, scheduled sends)
      +--> Provider interfaces: AI, Messaging, Email, Storage
```

Routes parse and authorise. Services hold business rules and own transactions.
Drizzle is the only thing that talks to Postgres. A route that contains a
business rule is a bug.

## Decisions

**Fastify over Express.** Native async error propagation, real per-route hook
composition (`preHandler: [authenticate, authorize('lead.create')]`), and a
faster JSON path. Express would have needed wrapper middleware to make thrown
errors reach the handler reliably.

**Drizzle over Prisma.** This product is reporting-heavy — funnel conversion,
revenue trend, executive performance, aggregate-with-filter counts. Drizzle lets
those live as real SQL (`count(*) filter (where ...)`, `generate_series` for
zero-filled trends) with full type inference, instead of fighting an ORM
abstraction or dropping to raw queries anyway. It also ships no query-engine
binary, which keeps deploys small.

**Zod contracts in a shared package.** `packages/shared` holds the validation
schemas, domain enums and the RBAC catalogue. The API validates with them; the
web app builds forms from the same schemas via `@hookform/resolvers/zod`. A
field's rules cannot drift between the two sides because there is one
definition.

**Structural enums in code, business config in the database.** Anything the
application branches on — lead status, visa workflow step, roles, permissions —
is a TypeScript enum mirrored by a Postgres enum. Anything it merely displays or
groups by — lead sources, travel types, visa countries, checklists, payment
methods — is a master-data table an admin edits at runtime. Adding a lead source
must never require a release.

**Money as integer paise.** Never floats. See [DATABASE.md](DATABASE.md).

**Denormalised read columns, single-writer.** `leads.next_followup_at` and
`leads.last_contact_at` are maintained by the service layer so the lead list can
sort and filter on them without correlated subqueries. Exactly one function is
allowed to write each (`syncNextFollowup`), so they cannot drift.

**Permissions are loaded per request, not read from the token.** Revoking a role
takes effect immediately rather than when a 15-minute access token expires.

## Request lifecycle

1. Helmet, CORS, cookie parsing, rate limiting.
2. `authenticate` verifies the access token and loads the user fresh from the
   database. An inactive or deleted user fails here.
3. `authorize(...permissions)` checks the caller holds every listed permission,
   and logs the denial with the route when it does not.
4. The route parses input with a Zod schema from `@lemuria/shared`.
5. The service applies business rules, opens a transaction where more than one
   table changes, and writes its audit entry inside that transaction.
6. The error handler maps whatever escaped to a stable envelope.

## Error handling

Services throw `AppError` with an `ErrorCode`. The handler distinguishes
expected business rejections (logged at info) from unexpected faults (logged at
error with a stack). Postgres SQLSTATEs are translated — `23505` becomes
`CONFLICT`, `23503` a validation error — so a driver message never reaches a
user. Every response carries a `requestId` matching the server log line.

## Frontend

Feature-first: `features/leads/` owns its pages, its hooks and its API bindings.
Shared UI lives in `components/ui`, the shell in `components/layout`.

Server state is TanStack Query; there is no global client store, because almost
nothing here is client state. Filters live in the URL, which makes a filtered
lead view shareable and survivable across a reload.

The access token is held in a module variable, never in `localStorage`. The
refresh token is an httpOnly cookie the SPA cannot read. On boot the app tries a
silent refresh, so a reload does not bounce an authenticated user to the login
screen even though nothing is persisted in JavaScript-readable storage.
Concurrent 401s collapse into a single refresh — otherwise six dashboard queries
would trigger six rotations and invalidate each other.

## Extending for Phase 2

External systems sit behind interfaces (`AIProvider`, `MessagingProvider`,
`EmailProvider`, `StorageProvider`) with a `noop` implementation as the default,
so a missing integration degrades to "not configured" rather than a crash. Every
module exposes REST endpoints under `/api/v1`, so a customer portal, supplier
portal or mobile client consumes the same surface the web app does.
