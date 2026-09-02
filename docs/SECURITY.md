# Security

## Authentication

Passwords are hashed with **Argon2id** (19 MiB, t=2, p=1 — the OWASP baseline)
plus a **pepper** held in the environment, not the database. A stolen dump alone
therefore cannot be cracked offline.

Sessions use a split-token model:

- **Access token** — a short-lived JWT (15 min default), returned in the body
  and held only in a JavaScript module variable. Never written to
  `localStorage` or a readable cookie.
- **Refresh token** — a 48-byte opaque random value, delivered as an httpOnly,
  SameSite=Lax cookie scoped to `/api/v1/auth`, and stored **hashed** so a
  database leak cannot mint sessions.

Refresh is **single-use with rotation**. Presenting an already-rotated token is
treated as replay of a stolen token and revokes every session for that user.

Changing a password revokes all other sessions.

**Login does not leak account existence.** Unknown account, wrong password and
deactivated user all return the same message; the unknown-account path still
spends comparable time hashing so it is not detectably faster. Login is rate
limited to 10 attempts per 5 minutes, and an account locks for 15 minutes after
5 consecutive failures.

MFA is schema-ready (`users.mfa_secret`, `mfa_enabled_at`) behind `MFA_ENABLED`.
Enforcement is not yet implemented — do not describe the system as MFA-protected
until it is.

## Authorization

Roles: `ADMIN`, `MANAGER`, `EXECUTIVE`, `FINANCE`, `OPERATIONS`. Permissions are
`resource.action` strings; the catalogue and default role mapping live in
`packages/shared/src/domain/permissions.ts` and are seeded into the database,
where they can be adjusted at runtime.

Two rules:

1. **Every sensitive route declares its permission**, checked server-side by the
   `authorize` hook. The frontend's `can()` only hides UI.
2. **Row visibility is enforced in the query.** A caller without
   `lead.read.all` gets a WHERE clause restricting them to leads they own or
   created — the rows are never fetched and filtered afterwards.

Permissions are re-read from the database on **every** request rather than
trusted from the token, so revoking a role takes effect immediately instead of
at token expiry.

## Documents

Passport, visa and identity documents are classed sensitive and gated behind
`document.read.sensitive`, which `EXECUTIVE` does not hold.

Object-storage keys are never exposed to the browser. Downloads go through an
authorised API route that checks permission and writes a `document_access_log`
row, so a storage URL cannot leak into a shared link and every read is
attributable.

ID numbers are stored **masked** (`••••••4567`). Where duplicate detection needs
to compare them, a peppered SHA-256 fingerprint is stored instead of the number.

Uploads are capped at 25 MB with MIME and extension validation.

## Audit

`audit_logs` is append-only; production revokes UPDATE and DELETE on it. Entries
record actor, action, entity, a field-level diff, IP, user agent and request id.
The actor's email is denormalised onto the row so the trail survives user
deletion.

Audit writes join the caller's transaction, so an entry cannot describe a change
that was rolled back.

## Transport and headers

Helmet sets the standard security headers. CORS is an explicit allow-list from
`CORS_ORIGINS` with credentials enabled. Cookies are `secure` in production.
Rate limiting is global (per authenticated user where possible, else per IP)
with tighter per-route limits on auth endpoints.

## Logging

Structured pino with hard redaction: authorization headers, cookies, passwords,
hashes, tokens, MFA secrets, API keys, passport and visa numbers, and the
storage/SMTP/WhatsApp credentials are replaced before reaching a transport. A
careless `log.info({ user })` cannot leak a hash.

## Secrets

Nothing is committed. `.env` is gitignored; `.env.example` holds placeholders.
The API **refuses to start in production** if `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` or `PASSWORD_PEPPER` still contain the placeholder text.

## Known gaps

Honest list — none of these are done yet:

- MFA is schema-ready but not enforced.
- Document encryption at rest uses the storage provider's encryption;
  application-level envelope encryption (`DOCUMENT_ENCRYPTION_KEY`) is wired
  through configuration but not yet applied.
- No automated dependency scanning in CI.
- Daily backups are a deployment responsibility (see DEPLOYMENT.md), not yet
  automated here.
