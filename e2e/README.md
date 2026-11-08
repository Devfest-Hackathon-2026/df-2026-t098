# WhyLint integration tests

Playwright MCP is for exploring and debugging the app. This package is the
repeatable Playwright Test suite: it starts Angular, the real built NestJS app,
and a new PostgreSQL cluster, then runs the same scenarios on mobile and desktop
Chromium. No application `.env` file or development database is used.

The core learning scenarios also exercise the Gemini adapter through a local HTTP
fixture. The actual frontend, Nest controllers, guards, migrations and PostgreSQL
persistence run normally. Gemini returns deterministic five-question batches,
scores and publication reviews so these checks can run without an API key.

## First run

Use Node.js 24.15 or newer and PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`) on
`PATH`. Run as a regular user; PostgreSQL cannot initialize a cluster as root.
Both applications need their existing npm dependencies installed.

```sh
cd ~/code/hackathon/e2e
npm ci
npx playwright install chromium
npm test
```

The default frontend is `../frontend` in this repository. To choose another
checkout explicitly:

```sh
WHYLINT_FRONTEND_DIR=/absolute/path/to/frontend npm test
```

This selects the source to serve; it does not copy files, switch branches, merge
work, or change the frontend proxy. Angular may write its normal generated
cache/build files in its own checkout. Keep frontend implementation work on its
own branch.

The browser origin is `http://localhost:4200`, matching the frontend's existing
Google-origin allowlist. Nest uses port 3101. These ports must be free; the harness
never reuses an existing server. The usual development backend on port 3000 and
PostgreSQL on port 5432 can keep running. To change only the test backend port:

```sh
WHYLINT_E2E_BACKEND_PORT=3102 npm test
```

Each run creates an empty local `whylint_auth_e2e_browser` database in a new
temporary cluster on a random port, applies the real migrations, and supplies
fixture-only JWT/Google configuration. Cleanup stops only the processes it
started and removes its own temporary directory. Success, test failures, Ctrl+C
and SIGTERM all trigger cleanup. SIGKILL or a machine crash cannot run teardown;
any leftover `whylint-browser-*` directory belongs to that interrupted run and
must not be removed while its PostgreSQL process is still running.

## Commands

```sh
npm run typecheck       # Check the Playwright config and test types
npm run test:mobile     # Pixel 7 Chromium emulation
npm run test:desktop    # Desktop Chromium, 1280 x 800
npm test -- --headed    # Watch the actual browser
npm test -- --grep "UI logout"
npm run report         # Open the most recent HTML report
npm run test:backend    # Existing Jest integration tests in a separate fresh DB
npm test -- learning.spec.ts # Core feed, assessment, community and recovery flows
```

One worker and no retries keep the initial suite within the real auth rate limits.
Each test receives a fresh browser context and unique fixture accounts. Avoid
raising the worker count, adding retries, or using `--repeat-each` without
accounting for the backend's per-route request limits. A fresh `npm test` starts a
new backend with a fresh limiter and database.

Core learning tests use dedicated users and revocable sessions inserted into the
owned disposable database during bootstrap. Their signed fixture cookies stay in
memory. This keeps account preparation independent of the auth suite's real signup
and login throttles. The auth suite continues to exercise the public login and
signup endpoints. Fixture account creation is guarded by the test environment and
the disposable database URL, and has no application HTTP endpoint.

## Core learning coverage

- Exactly five generated questions, the general-topic question, and next-batch
  prefetch on the third active card.
- Server-side assessment, a failing score in the private review collection, a
  passing retry, replay-safe XP, daily goals, levels and weekly rankings.
- Publishing a reviewed community question, showing it to another learner,
  idempotent likes, saved questions, comments and stable share links.
- Explicitly injected AI setup/assessment outages, retained answer drafts and
  recovery through the real backend. These browser error cases complement the
  provider and backend tests for missing configuration and upstream failures.

The share test substitutes the browser clipboard API to check the copied URL.
Gemini outputs are fixtures. Live Gemini quality/latency and native device sharing
need separate verification after credentials and a device are available.

## What the suite proves

| Scenario | Integration exercised |
| --- | --- |
| Guest login | Real `/me` 401, Japanese labels, English toggle, form visibility, input size and horizontal overflow |
| Password form | Missing-field validation without requests and no credential persistence |
| UI signup | Real user/session creation, HttpOnly/Secure/SameSite cookie, safe `/me` profile and onboarding redirect |
| Optional Google username | Skip during onboarding, save during onboarding or Profile, retry, reload and Google re-login persistence |
| Session restoration | Real cookie-backed guest guard, feed/profile redirect and page reload |
| UI password login | Wrong-password rejection, case-insensitive email/username login and frontend restoration |
| UI logout | Real account button, untrusted-origin rejection, pending/disabled state, failure/retry, cookie removal, copied-cookie revocation and independent-session survival |
| Session outage | Explicitly injected `/me` 503, hidden sign-in controls and retry back to the real backend |
| Mocked Google success | Actual Google button/state/callback, real backend auth and ID-token verification, session cookie, loaded avatar and image-error fallback |
| Mocked Google failure | Invalid/missing one-time state avoids exchange; rejected fixture code creates no session |

Signup, password sign-in, optional username setup and logout use the actual
frontend controls. Some unrelated scenarios prepare accounts through the real
API. The session-outage test is intentionally fault injection; other `/me` requests reach
the real backend.

Google's authorization page is intercepted locally by Playwright. In the backend
test process, Nock intercepts Google's token and certificate HTTP endpoints and
blocks other outgoing HTTP. Synthetic ID tokens are signed with an ephemeral
RSA key; the real `google-auth-library` verifier still checks the fixture token
before the real Nest service creates a PostgreSQL session. No real Google
authorization request, account, secret, callback code or token is used. This
does **not** verify real Google OAuth, consent, deployed redirect configuration,
backend-bound state/PKCE, or native Google sign-in.

Mobile emulation checks a browser viewport. An actual Android/iOS Capacitor app,
WebView cookie compatibility, device keyboard, safe areas and system-browser
handoff still need device testing. The endless five-question/prefetch behavior is
outside this auth suite. Cloud Run deployment and the hackathon platform
requirement remain unverified by these local tests.

## Playwright MCP exploration

```sh
cd ~/code/hackathon/e2e
npm run stack
```

Open `http://localhost:4200/login` through Playwright MCP in a new isolated browser
context. This is the disposable stack, including the backend Google HTTP fixture.
Use only synthetic accounts; do not follow Google externally. The repeatable
suite installs its own browser-side authorization intercept, while a manual MCP
session needs to isolate that navigation before clicking the Google button.
Stop the terminal with Ctrl+C when done. Stop this manual stack before `npm test`,
which deliberately refuses to reuse it. Restore the original browser viewport
after mobile exploration.

## Reports and CI

The HTML report and failure screenshots are ignored under `playwright-report/`
and `test-results/`. Startup failures copy fixture-only server logs into
`test-results/stack/` before removing the temporary cluster. Successful runs
remove server logs with the cluster. Traces, videos, HARs and saved authentication
state are disabled: they can retain cookies, credentials and OAuth parameters.
Only use this suite with disposable fixtures, including when debugging failures.

Once the auth frontend and backend are available in the same CI revision, a job
can install both apps and this package, add PostgreSQL's `bin` directory to
`PATH`, then run:

```sh
npm ci --prefix e2e
npm exec --prefix e2e -- playwright install --with-deps chromium
WHYLINT_FRONTEND_DIR="$GITHUB_WORKSPACE/frontend" npm test --prefix e2e
npm run test:backend --prefix e2e
```

Use a non-root runner and Node.js 24.15+. No Google secrets, database service,
cloud credits or billing account are needed. Upload the ignored report directory
as a CI artifact if useful. This package provides the CI command; no workflow is
enabled while the auth source still lives on separate, unmerged dirty branches.

The setup follows Playwright's [managed web-server lifecycle](https://playwright.dev/docs/test-webserver),
[browser/API integration guidance](https://playwright.dev/docs/api-testing), and
[explicit request mocking](https://playwright.dev/docs/mock).
