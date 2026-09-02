# API

Base path `/api/v1`. JSON only. The SPA calls it same-origin through the Vite
proxy in development and through the reverse proxy in production, so the refresh
cookie stays first-party.

## Envelope

Success:

```json
{ "success": true, "data": { } }
```

List endpoints add pagination metadata:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "pageSize": 25, "total": 62, "totalPages": 3 }
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need attention.",
    "details": { "phone": ["Enter a valid 10-digit Indian mobile number"] },
    "requestId": "b1f2…"
  }
}
```

`message` is safe to show a user. `details` carries field errors for
`VALIDATION_ERROR` and the candidate list for `DUPLICATE_DETECTED`. Database
errors, stack traces and provider internals never appear. `requestId` matches
the server log line.

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Input failed schema or a referenced row is missing |
| `UNAUTHENTICATED` | 401 | No, expired or invalid session |
| `FORBIDDEN` | 403 | Authenticated but lacks the permission |
| `NOT_FOUND` | 404 | No such record, or not visible to this caller |
| `CONFLICT` | 409 | Unique constraint |
| `DUPLICATE_DETECTED` | 409 | Possible existing person; `details.candidates` |
| `INVALID_STATE_TRANSITION` | 422 | Illegal status change |
| `AI_REVIEW_REQUIRED` | 422 | AI content not yet approved for sending |
| `RATE_LIMITED` | 429 | Too many requests |
| `PAYLOAD_TOO_LARGE` | 413 | Upload over the limit |
| `DEPENDENCY_FAILURE` | 502 | An external provider failed |
| `INTERNAL_ERROR` | 500 | Unexpected fault |

## Conventions

- **Pagination** — `page` (from 1) and `pageSize` (max 200, default 25).
- **Sorting** — `sortBy` and `sortDir`. Only allow-listed columns are accepted;
  anything else falls back to the default, so a sort parameter can never reach
  SQL as raw text.
- **Filtering** — filters are applied in SQL. No endpoint returns an unbounded
  set for the client to filter.
- **Auth** — `Authorization: Bearer <accessToken>`. The refresh token is an
  httpOnly cookie scoped to `/api/v1/auth`.
- **Authorization** — every route declares the permission it needs. The
  frontend's checks only hide UI.

## Endpoints

### Auth

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | 10 requests per 5 min. Identical failure for unknown account, wrong password and inactive user |
| POST | `/auth/refresh` | cookie | Rotates the refresh token; reuse revokes the whole chain |
| POST | `/auth/logout` | any | Revokes the presented refresh token |
| GET | `/auth/me` | any | Current user with resolved permissions |
| POST | `/auth/change-password` | any | Revokes all other sessions |

### Leads

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/leads` | `lead.read` |
| GET | `/leads/summary` | `lead.read` |
| POST | `/leads/check-duplicates` | `lead.create` |
| POST | `/leads` | `lead.create` |
| GET | `/leads/:id` | `lead.read` |
| PATCH | `/leads/:id` | `lead.update` |
| POST | `/leads/:id/assign` | `lead.assign` |
| POST | `/leads/:id/score` | `lead.score` |
| GET | `/leads/:id/scores` | `lead.read` |
| GET | `/leads/:id/timeline` | `lead.read` |
| POST | `/leads/:id/notes` | `lead.update` |
| DELETE | `/leads/:id` | `lead.delete` (soft delete) |

`GET /leads` filters: `search`, `status`, `classification`, `leadSourceId`,
`assignedToId`, `unassigned`, `mine`, `followupState`, `createdFrom`,
`createdTo`, `minScore`, `maxScore`.

A caller without `lead.read.all` sees only leads they own or created — enforced
in the query, not by filtering afterwards.

`POST /leads` returns `DUPLICATE_DETECTED` with candidates unless
`acknowledgeDuplicates` is true or `linkToCustomerId` is set. Records are never
merged automatically.

### Follow-ups

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/followups` | `followup.read` |
| GET | `/followups/buckets` | `followup.read` |
| POST | `/followups` | `followup.create` |
| POST | `/followups/:id/complete` | `followup.complete` |

`/followups/buckets` takes `scope` = `auto` (default), `me` or `team`. `auto`
mirrors the visibility rule the list uses, so a tab count always describes the
rows that tab actually shows.

### Customers

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/customers` | `customer.read` |
| GET | `/customers/summary` | `customer.read` |
| POST | `/customers/check-duplicates` | `customer.create` |
| POST | `/customers` | `customer.create` |
| GET | `/customers/:id` | `customer.read` (the 360 profile) |
| PATCH | `/customers/:id` | `customer.update` |
| GET | `/customers/:id/timeline` | `customer.read` |
| PUT | `/customers/:id/preferences` | `customer.update` |
| POST | `/customers/:id/passports` | `customer.update` **+** `document.read.sensitive` |
| POST | `/customers/:id/notes` | `customer.update` |
| POST | `/customers/:id/group` | `customer.update` |
| DELETE | `/customers/:id/group/:memberId` | `customer.update` |
| POST | `/customers/:id/recalculate` | `customer.update` |
| DELETE | `/customers/:id` | `customer.delete` (soft delete) |
| POST | `/leads/:id/convert` | `lead.convert` **+** `customer.create` |

`GET /customers` filters: `search`, `tier`, `ownerId`, `mine`, `isActive`,
`repeatOnly`, `passportExpiringInDays`, `createdFrom`, `createdTo`.

The 360 profile is assembled from parallel queries rather than one wide join —
a customer with twelve bookings and forty documents would otherwise multiply
into hundreds of duplicated rows for the application to de-fan in memory.

A travel group is people who travel together, not a household record — every
member keeps their own profile, passport and history. Linking two customers who
already belong to *different* groups is refused rather than silently merging two
families, and unlinking the second-to-last member dissolves the group instead of
leaving a stub of one.

`POST /leads/:id/convert` refuses an illegal transition (an `OPEN` lead cannot
convert directly) and refuses a second conversion with `CONFLICT`. The lead is
never deleted: it keeps its code, score history and timeline, and gains a
customer link.

### Documents

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/documents` | `document.read` |
| GET | `/documents/expiring` | `document.read` |
| POST | `/documents` | `document.upload` (multipart) |
| GET | `/documents/:id/download` | `document.read` |
| POST | `/documents/:id/verify` | `document.upload` |
| DELETE | `/documents/:id` | `document.delete` (soft delete) |

Three rules govern this module:

- **Classification gates visibility.** `PASSPORT`, `VISA` and `IDENTITY_PROOF`
  need `document.read.sensitive`. A caller without it does not see them in any
  list, on the 360 profile, or in the timeline — they do not learn such a
  document exists. The profile sets `documentsRestricted: true` so the UI can
  say so honestly rather than implying the customer has no documents.
- **Storage keys never leave the server.** Responses go through a projection
  that strips `storageKey`, `storageDriver` and the checksum. Downloads run
  through the authorised route, which re-checks classification and writes a
  `document_access_log` row — every read of a passport is attributable.
- **Content type is sniffed, not trusted.** The declared MIME is a claim; the
  leading bytes decide. A text file renamed `.png` is rejected, and a ZIP is
  accepted only when the extension says it is a DOCX or XLSX.

### Dashboard

All require `dashboard.read`; company-wide figures additionally require
`dashboard.read.company`, otherwise the caller sees their own book.

`/dashboard/kpis`, `/funnel`, `/lead-sources`, `/revenue-trend`,
`/recent-enquiries`, `/visa-cases`, `/at-a-glance`.

Every figure is computed from Postgres on request. Nothing is hardcoded.

### Master data and users

`/master-data/lead-sources`, `/travel-types`, `/destinations`,
`/visa-countries`, `/payment-methods`, `/supplier-types` — all `masterdata.read`.

`/users/assignable` returns only the fields the assign dropdown needs, so it
cannot become a staff directory leak.

## Health

`GET /health` is unauthenticated and exempt from rate limiting, for load
balancer probes.
