# WhyLint browser and backend integration tests

## Core learning regression extension

- Exercise the new learning API and real Angular entry points on both existing
  viewports. Preserve all auth scenarios and keep the real auth throttles enabled.
- Add a Gemini HTTP fixture beside the Google OAuth fixture. Return exactly five
  questions per generation, deterministic failing/passing understanding scores,
  and reviewed community publication responses. No request reaches external AI.
- Seed dedicated learning users/sessions only in the guarded disposable browser
  database, with cookies held in memory by tests. This prepares core scenarios
  without increasing the auth suite's signup/login calls beyond its real limits.
- Verify third-card prefetch, fail/retry/pass, server-awarded XP idempotency, daily
  completion and weekly ranking, community visibility to another user, likes,
  bookmarks, comments and share URLs. Inject transient browser response failures
  to prove answer preservation and recovery without turning errors into scores.
- Keep live Gemini and actual mobile/Capacitor behavior separate from these results.

## Username and signup regression extension

- Replace the old UI-only password assertions with form validation and real
  password-login coverage. Replace the API-only signup scenario with actual
  `/signup` interaction, profile restoration, and authenticated guest-page guards.
- Cover Google username omission/skip, setting during onboarding and later in
  Profile, persistence on reload/Google re-login, pending state and retry.
- Keep both projects, the real Nest backend, PostgreSQL migrations and synthetic
  Google boundary. Reuse existing signup/password fixtures so the entire suite
  remains within the backend's real 10-per-route/minute throttle; no test bypass.

## Logout and avatar regression extension

- Add actual account-button logout coverage on mobile and desktop, including
  duplicate-click suppression, failure/retry, cookie clearing and copied-cookie
  revocation. Signup and password submission remain API-only coverage.
- Include a picture in the signed Google fixture and locally fulfill its image
  request. Verify that the image actually loads and that a failed image falls
  back to the existing icon. Keep every external Google request isolated.
- Verify existing NULL-avatar backfill and missing-picture preservation in the
  disposable PostgreSQL integration suite. Do not mutate development user rows.

## Goal and current state

Run the repeatable Playwright Test suite against the merged Angular frontend and
real NestJS backend in this repository. Both auth branches and the desktop UI
are now merged into `main`. Default to `../frontend` and `../backend`, while
preserving `WHYLINT_FRONTEND_DIR` for explicitly testing another checkout.
Removing the old frontend checkout must leave the default test command usable.

Signup, password sign-in, username setup and logout now have real frontend
controls and browser coverage. Some scenarios use API requests for account
preparation. Keep the persisted session entity and JWT verification unchanged.

## Architecture and contracts

- Use a standalone private npm package under `e2e/`; do not modify either
  application's dependencies or source to add test-only behavior.
- Run Playwright Test with a fresh browser context per test, one worker, a mobile
  Chromium project and a desktop Chromium project. Preserve Japanese defaults.
  Use semantic labels/roles for interactions and real response/state assertions.
- Start the real backend from its build, using the existing migrations, cookie
  parser, controllers, guards, JWT service, sessions and PostgreSQL repositories.
  Use a dedicated loopback port (3101 by default), never the existing port 3000
  server. Refuse to reuse an already-running test stack.
- Start Angular from the selected source checkout on `http://localhost:4200`
  because the current OAuth UI explicitly allows that origin. Supply a generated
  proxy file in the temporary directory that routes `/api/**` to the test backend.
  Do not change the frontend's proxy configuration.
- Create a new temporary PostgreSQL cluster with `initdb` and `pg_ctl`, listening
  on loopback only, using a random available port and fixture-only credentials.
  Create a disposable `whylint_auth_e2e_*` database and apply real migrations.
  Never read either application's `.env`, or accept a user's application database
  URL as the test database. Supply every auth/database environment value explicitly.
- Stop child servers and PostgreSQL on success, failure, SIGINT and SIGTERM.
  Remove only the temporary directory created by this run. An optional manual
  stack command supports isolated Playwright MCP exploration and cleanup.
- Isolate Google's authorization page in Playwright. Intercept the backend's
  outgoing token/certificate HTTP calls only in a test preload using Nock, with
  outbound HTTP disabled. Return synthetic RS256-signed ID tokens and a temporary
  public verification key so the actual Google ID-token verifier, auth service,
  session persistence and cookie response still execute. Reject unexpected codes
  and configuration; never contact real Google or use real credentials/codes.
- Do not print cookie values, JWTs, OAuth parameters or credential bodies. Browser
  requests may keep synthetic cookies in memory. Do not save storage state. Keep
  traces/videos disabled by default because they capture request bodies/cookies;
  failure screenshots and HTML reports contain fixture-only data and are ignored.

## First testable flows and acceptance criteria

1. A fresh guest gets a real 401 from `/api/v1/auth/me`, remains on `/login`, and
   sees the Japanese form and Google action. The login form fits the mobile and
   desktop viewport, inputs are at least 16px, and controls can be reached.
2. Missing password fields show validation without a network request. A valid
   submission reaches password login; invalid credentials return a generic error.
3. The signup page creates a real database user/session and protected
   cookie; `/me` returns only the documented profile. Cookie JavaScript access is
   blocked. Visiting `/login` redirects to onboarding for a new learner, or the
   homepage/profile when onboarding is complete; reload restores the session.
4. The password login form accepts email and username and restores the frontend's
   session. Wrong credentials return 401. Verify both email and username input through the real form.
5. The account logout button clears the cookie and revokes its database session. Replaying the
   previously captured synthetic cookie returns 401, while a separate session
   remains valid. Returning to `/login` shows the guest screen.
6. A backend session-check failure shows a retry action without sign-in controls;
   removing the injected failure and retrying reaches the real guest response.
7. A click on the real Google action creates one-time frontend state. A fully
   isolated authorization redirect plus backend token/certificate fixtures leads
   through the real callback, real backend `/login`, cookie and `/me`, to the app.
   State and callback query parameters are consumed. Clearly label this mocked
   Google integration; it is not real Google OAuth verification.
8. Mismatched/missing state is rejected without a backend code exchange, callback
   parameters are removed, and the user can start again. A rejected synthetic
   provider code produces the existing retryable sign-in error without a session.

## Implementation milestones and deliverables

1. Save this specification, inspect current files and capture a baseline of both
   dirty checkouts before implementation. Refresh backend build/unit tests and
   frontend build/unit tests rather than relying on the previous session.
2. Add package/lockfile, Playwright configuration, isolated local stack lifecycle,
   Google fixture preload and browser fixtures/tests. Document prerequisites,
   commands, configurable frontend path, report handling and CI setup.
3. Explore the running disposable stack with Playwright MCP, including mobile
   viewport inspection; restore the original exploration viewport afterward.
4. Run both Playwright projects against the isolated stack, run the existing
   PostgreSQL integration suite in a separate empty disposable database, inspect
   cleanup, and verify the original work/branches were preserved.

## Validation limits

Browser emulation does not verify a Capacitor WebView, device keyboard, native
Google flow, deployed cross-origin behavior, Google consent, production OAuth
state/PKCE or real Google token exchange. Report these limits and any pre-existing
warnings/failures explicitly. Do not publish, merge, switch branches or commit.
