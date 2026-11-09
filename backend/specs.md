# Password authentication and session logout

## Google display-name backfill

- Fix the confirmed gap where an existing Google user can have a stored avatar
  and username but a NULL display name. Keep this change in the backend checkout;
  preserve all current username, password, avatar and session behavior.
- Use a nonempty display name from the verified ID token. If either name or
  picture is missing, use the existing short-timeout UserInfo fallback and
  accept its metadata only when its subject matches the verified token subject.
  Do not replace a present ID-token claim with optional UserInfo data.
- Store the resolved display name when creating an account and refresh a changed
  or missing name on later Google login, matched by internal ID and Google
  subject. Missing/blank/malformed names must never erase a saved name. Preserve
  username, email, password and Google identity; no account linking by email.
- Do not hardcode the user's supplied display name, manually edit their row, or
  log profiles, credentials or tokens. Their account can backfill through a fresh
  Google sign-in. No schema migration or frontend change is required.
- Verify ID-token names, UserInfo fallback even when a picture is present,
  mismatched UserInfo subjects, unavailable/missing optional data and persistence
  failures in unit tests. Verify a NULL-name backfill and later name refresh in
  disposable PostgreSQL integration tests, including username preservation.

## Optional username setup and email signup extension

### Scope and identity contract

- Google users may keep a NULL username. Offer optional setup during onboarding
  and in the signed-in Profile when missing. Email signup continues to require
  email, username and password. Wire its existing password login as part of the
  usable signup/sign-out/sign-in flow. Preserve Google avatars and logout.
- Add `username: string | null` to the existing safe `/auth/me` profile. Keep
  `id,email,name,avatarUrl` and the cookie/JWT/session contracts. No schema change
  is needed: the nullable username column and normalized unique index exist.
- Add `PATCH /api/v1/auth/me/username`, JSON `{username}` only, returning the safe
  current-user profile. Use the authenticated JWT subject rather than any client
  user ID; enforce active persisted session, trusted Origin, JSON body, strict
  DTO validation, rate limiting, database-error sanitization and no-store.
- Use the existing username rules for signup and setup: trim surrounding spaces,
  3–32 Unicode characters, letters/numbers/dot/underscore/hyphen, no `@`, and
  case-insensitive database uniqueness. Use a shared DTO to avoid rule drift.
- Set only a missing username with a conditional database update. A retry of the
  already-owned username is idempotent; another value returns 409. Different
  users racing for the same normalized username must produce one winner and one
  conflict. Never update email, Google identity, password or another user.
- Keep ownership in UsersService; AuthService/controller expose the authenticated
  profile action. Missing/deleted users return 401, unavailable/taken/already-set
  names 409, invalid input 400. Propagate other database failures to the existing
  filter. Do not run migrations or user writes against development data for tests.

### Delivery and validation

- Keep backend changes on `backend/auth` and frontend changes in the separate
  `frontend/google-login` checkout. Inspect and preserve dirty work; no branch
  switch, copying application trees, commit, push, merge or deployment.
- Cover DTO inheritance/Unicode/whitespace, authenticated ownership, malformed
  and extra fields, conflicts, idempotence and simultaneous claims in unit and
  disposable PostgreSQL tests. Recheck both builds and existing suites.
- Extend mobile/desktop Playwright tests for real UI signup, password login and
  optional username setup/skip. Reuse existing account-creation scenarios to stay
  within real per-route limits; do not disable rate limits or Google isolation.
- Restore the normal dev servers after fixture testing. Never read or print real
  credentials, cookies, Google tokens or callback codes. Physical device and
  deployed Cloud Run behavior require separate verification.

## Google avatar refresh and frontend logout follow-up

- The user has manually verified real Google login. Fix the missing logout UI
  and the missing avatar without changing authentication/session contracts.
- Keep backend edits on `backend/auth`. Make authorized frontend edits only in
  the separate `frontend/google-login` checkout; preserve both dirty trees and
  do not copy, switch, commit or merge either checkout.
- Google account creation continues to persist the verified token's picture.
  Existing users must refresh a changed/missing avatar on subsequent Google
  login, matched by both internal user ID and verified Google subject. Never
  update identity/email/password fields or link accounts by email.
- Accept a nonempty HTTPS picture URL; absent/malformed claims leave a stored
  avatar intact. An omitted picture is valid Google behavior. Do not log Google
  payloads, tokens, codes, image URLs or credentials, and do not repair user rows
  manually. The current NULL row can be filled on the next Google login when
  Google supplies its picture claim. No migration is required.
- If the verified ID token omits a picture and the token exchange supplies an
  access token, request Google's fixed OpenID UserInfo endpoint with a short
  timeout. Accept only a picture whose UserInfo subject equals the verified
  token subject. Keep the access token ephemeral; a failed optional profile
  request must not fail login or clear a stored avatar.
- Verify new-user avatar storage, an existing NULL avatar, changed pictures,
  missing/invalid pictures, and persistence failure. Use the disposable PostgreSQL
  suite and extend the real browser suite with fixture avatars and UI logout.
- Keep JWT signature/expiry validation and persisted-session revocation intact.
  Restore the normal development servers after testing; do not automate the
  user's real Google account or use development data as test fixtures.

## JWT verification and auth file organization

- Keep the persisted session entity and server-side revocation: clearing a browser cookie alone cannot invalidate a copied JWT before it expires. Preserve the existing 7-day JWT/cookie lifetime, both cookie and Bearer authentication, and all endpoint contracts.
- Use `JwtService.verifyAsync` for signature, algorithm and expiry verification; require the existing `sub`, `sid` and `exp` claims, and continue checking that the corresponding session belongs to the user and has not expired or been revoked. Invalid or expired tokens must produce 401; do not weaken origin, body, password, rate-limit or database error guards.
- Group JWT verification, payload types and guard under `src/auth/jwt/`; group the session entity and service under `src/auth/sessions/`. Keep user-owned user entity and Google DTO in their current locations. Update datasource entity discovery, imports and related tests without moving or rewriting applied migrations.
- Verify valid, expired, tampered and malformed JWTs; revoked/missing/expired sessions; cookie and Bearer flows; logout; password signup and Google compatibility. Run the backend build and relevant tests; use only a disposable test database for integration tests. Do not modify the user's database or credentials.

## Goal and boundaries

Add email-or-username signup and password login plus real current-session logout to the existing NestJS backend. Preserve the current Google login endpoint and frontend response/cookie contract. Follow the repository's existing plain Nest services, DTOs and snake_case entity properties. Keep frontend changes in their separate checkout as authorized by the follow-up request. Do not log credentials or authorization codes, or access production services.

## API contract

- `POST /api/v1/auth/login`: existing Google authorization-code login `{code}` and HttpOnly `access_token` cookie. Keep response shape compatible.
- `POST /api/v1/auth/signup`: `{email, username, password}`; create the password user and a session, return a message and set the same cookie. Email ownership is unverified; no account recovery or email-based identity linking is provided.
- `POST /api/v1/auth/password/login`: `{identifier, password}`; identifier is email or username; generic 401 for missing account, Google-only user, or wrong password; on success create a session, return a message and set the same cookie.
- `GET /api/v1/auth/me`: unchanged response `{id,email,name,avatarUrl}` and requires a valid, active session.
- `POST /api/v1/auth/logout`: revoke the verified current session and clear the cookie. Missing, expired, or invalid token clears the browser cookie idempotently; do not revoke from unverified claims. A database failure must not be reported as successful revocation.
- Google login, signup and password login accept JSON only and enforce a configured trusted `Origin` as a CSRF boundary for this browser flow; logout enforces the same origin policy. Non-browser bearer logout may omit Origin only when no cookie is present. Google OAuth state/PKCE and native cookie/CORS integration remain separate work and must not be claimed complete.

## Schema and identity

- Preserve existing users: make `google_id` nullable while retaining uniqueness. Add nullable `username` and nullable `password_hash`; Google users remain valid without either.
- Enforce case-insensitive uniqueness at the database level for trimmed email and username. Migrations must fail on existing collisions without deleting or silently merging records. Usernames cannot contain `@`; identifier lookup uses email when it contains `@`, username otherwise. Passwords are never trimmed or normalized.
- Existing verified Google users can continue signing in by Google subject. Never auto-link a password identity and Google identity just because their emails match; reject collisions safely.
- Store Argon2id password hashes with library-generated salt; never return password hashes or place them in JWTs. Unknown and Google-only users must perform a dummy verification to reduce timing differences. Rate-limit signup and password login.
- Persist a `sessions` table with UUID ID, user FK, expiry, creation and revocation timestamps. Both Google and password login issue JWTs with `sub` and `sid`. Guard verifies signature/expiry and checks the active session belongs to that user. Old JWTs without `sid` will require sign-in again.
- Migrations may not destroy or merge users. Rollback must refuse to restore `google_id NOT NULL` while password-only users exist.

## Implementation and verification

- Keep existing `.env` and uncommitted work; use the existing JWT secret without printing it. Use Argon2id at least 19 MiB memory, 2 iterations, parallelism 1.
- Validate request shapes and limits without rejecting Unicode passphrases or altering password bytes. Use a generic conflict response and do not log sensitive input.
- Test signup, case-insensitive lookup, Google-account coexistence, generic invalid credentials, session issue/expiry/revocation, cookie/bearer behavior, CSRF origin and rate limiting. Test migrations with a disposable PostgreSQL database; do not drop or replace the user's database. Run the backend build and focused tests, and report pre-existing test failures honestly.
- Distinguish prototype constraints from production readiness: email verification, account recovery, production OAuth PKCE/state, multi-instance rate limiting and deployed cookie/CORS settings remain unfinished. A signup conflict still reveals that an account or username is unavailable; generic wording does not fully prevent enumeration.
