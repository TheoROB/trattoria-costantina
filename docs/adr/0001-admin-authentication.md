# ADR 0001 — Admin authentication

- Status: accepted (Lot D1)
- Date: 2026-10-06

## Context

The admin area serves exactly two accounts with identical rights (owner and agency). No signup, no user management, no password reset by email, no OAuth. Stack: Next.js 16 App Router on a long-running Node 24 process (Hostinger, possibly several processes, idle processes stopped), MariaDB/MySQL via `mysql2`. Requirements: modern password hashing, server-verified revocable sessions, HttpOnly/Secure/SameSite cookies, CSRF protection, login rate limiting with temporary lockout, no account enumeration, server-side authorization on every mutation.

## Options

### A. Maintained library

Candidates checked on 2026-10-06 (npm registry and official docs):

- **Auth.js / next-auth v5**: still `5.0.0-beta.32`; `latest` is v4 (Pages-era API). Its Credentials provider is designed around JWT sessions, so revocation needs extra work. Rejected: not stable.
- **iron-session 9**: encrypted stateless cookie. Logout cannot revoke a stolen cookie before expiry. Rejected: fails "sessions révocables".
- **Better Auth 1.7.7** (stable, active): the only serious candidate. It supports MySQL through `mysql2`, database sessions, `disableSignUp`, and DB-backed rate limiting.
  - Ships `/api/auth/*` endpoints: sign-up (disabled by flag), sign-in, sign-out, request-password-reset, reset-password, change-password, session listing, etc. That is far more surface than two accounts need, so each one has to be disabled or audited.
  - Its own schema (`user`, `session`, `account`, `verification`) and CLI migrations, separate from our versioned SQL migrations.
  - Default hash is scrypt. Argon2id needs custom `hash`/`verify` functions, which is exactly the sensitive code we wanted to avoid writing.
  - Rate limiting is per request/IP with a generic window. There is **no account lockout**, so lockout would still be custom code.
  - Its catch-all Route Handler sits outside Server Actions, so it has its own CSRF/trusted-origins configuration to get right behind Hostinger's proxy.
  - Large dependency tree for a two-account admin.

### B. Minimal custom implementation (selected)

About 250 lines of sensitive code in 4 small files, all unit- or integration-tested:

- `lib/auth/password.mts`: Argon2id via `node:crypto.argon2` (built into Node ≥ 24.7, no native dependency), OWASP parameters (m=19 MiB, t=2, p=1), PHC string format, constant-time comparison.
- `lib/auth/session.ts`: 32-byte random token in cookie `__Host-tc_admin` (HttpOnly, Secure, SameSite=Strict, Path=/), only the SHA-256 stored in `admin_sessions`, 8 h absolute expiry checked in SQL, new token at every login, row deleted on logout.
- `lib/auth/rate-limit.ts`: attempts stored in MariaDB (works with several processes and restarts), keyed by HMAC-SHA256 of the normalized email (and of the client IP only when a trusted proxy header is configured). 5 failures in 15 minutes lock the email temporarily. The response is the same generic message whether the email is unknown, the password wrong, or the account locked; a dummy Argon2 verification equalizes timing. Old rows are purged opportunistically.
- `lib/auth/dal.ts` (`server-only`): `requireAdmin()` re-validates the session against the database and is called at the start of every protected page and every Server Action. `proxy.ts` makes no authorization decision.

CSRF: mutations are Server Actions (POST only, Next.js Origin/Host check, `serverActions.allowedOrigins` if the Hostinger proxy rewrites Host) plus a SameSite=Strict cookie.

Accounts: created or rotated with `scripts/admin-user.mts`. The script reads the password from stdin (never argv or env), hashes it, refuses a third account, and revokes that account's sessions on rotation. No plaintext anywhere in Git, migrations or logs.

## Decision

**B.** For exactly two credential accounts, the library does not remove the sensitive parts we need: lockout and Argon2id would still be custom. It adds an HTTP surface (reset/change password, session APIs) and a second schema/migration system, and it would need its own proxy and CSRF configuration. The custom code is smaller than the configuration and hardening the library needs. It uses only Node built-ins plus `mysql2` and `zod`, already in the stack, and an independent black-box security suite (`tests/security/**`) tests it.

## Consequences

- We own the security of ~250 lines: they are kept small, have no feature growth beyond this ADR, and are covered by unit, integration and independent security tests.
- Revisit if the scope grows (more users, roles, password reset by email, 2FA): then adopt a library rather than extend this code.
- Production needs `AUTH_HMAC_SECRET` (≥ 32 random chars) and a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (multi-process). Set `AUTH_TRUSTED_IP_HEADER` only once the Hostinger proxy header is verified by the probe.
