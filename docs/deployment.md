# Deploying WhyLint

WhyLint ships as **one container that serves the Angular app and the API from the same origin**.
The session cookie is `SameSite=Lax` and the app calls a relative `/api`, so the page and the API
must share an origin. Do not put the app behind Firebase Hosting rewrites (they strip every cookie
except `__session`) or on a different hostname from the API.

```
browser ──https──▶ Cloud Run (this image)
                     ├─ /api/v1/**   NestJS API
                     └─ everything else   Angular build (index.html fallback for deep links)
                   Cloud SQL (PostgreSQL)   ◀── release job: migrations + question pool
```

What is verified and what is not is listed at the end of this page.

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `DB_URL` | yes | `postgresql://user:password@host:5432/whylint`. Cloud SQL Unix socket: `postgresql://user:password@/whylint?host=/cloudsql/PROJECT:REGION:INSTANCE`. |
| `DB_SSL` | no | `off` (default), `verify` (TLS, certificate and host name checked), `no-verify` (encrypts only). Any other value stops startup. |
| `DB_SSL_CA` / `DB_SSL_CA_FILE` | with `verify` | Trust anchor as PEM text (`\n` escapes allowed) or a path to a mounted PEM. Without either, system CAs are used. |
| `JWT_SECRET` | yes | At least 32 random characters. Store in Secret Manager. |
| `FRONTEND_URL` | yes | The public origin of the service, for example `https://learn.example.com`. **Exactly one origin**: writes carrying any other `Origin` get 403. Use the custom domain, not a second `*.run.app` URL. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | See "Known gaps". |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_THINKING_LEVEL` | for AI grading and generation | The pool and tap grading work without them. |
| `NATIVE_APP_ORIGINS` | for the mobile app | `capacitor://localhost,https://localhost`. Empty (default) accepts no app origin. See [mobile.md](mobile.md). |
| `TRUST_PROXY` | on Cloud Run: `1` | Hops of trusted proxy. Without it every learner shares one rate-limit bucket. |
| `PORT` | no | Defaults to 8080 in the image; Cloud Run sets it. |
| `FRONTEND_DIST` | set by the image | `/app/public`. Unset means API only (local development). A wrong path stops startup. |
| `LEARNING_POOL_SEED` | no | `off` skips the seed at startup once the release job owns it. The seed is idempotent either way. |

`NODE_ENV=production` is baked into the image (it enables HSTS). Never commit real values; `.env*`
files are excluded from the Docker build context.

## Build and try it locally

```bash
docker build -t whylint .
e2e/scripts/container-smoke.sh whylint
```

The smoke script starts a throwaway `postgres:16-alpine`, runs the release job twice (the second
run must change nothing), starts the app, and runs `e2e/scripts/smoke-http.sh` against it: probes,
app shell and deep links, cache headers, security headers, the seeded pool, and same-origin sign-up
with its session cookie. CI runs the same two commands in the `image` job.

## Release job

```bash
node dist/scripts/release.js        # or: npm run release (after npm run build)
```

Applies pending migrations in one transaction, then loads `seed/question-pool.json`. Both steps are
repeatable. Run it once per deploy, **before** the new revision takes traffic, and not twice at the
same time (there is no lock). It needs only `DB_URL` (+ `DB_SSL*`). Use a database role that can
alter the schema for the job, and a role limited to reads and writes for the service.

## Probes

- `GET /api/v1/health` — the process is up; never touches the database. Use for liveness.
- `GET /api/v1/health/ready` — runs `SELECT 1` (answer cached for 2 s, 2 s timeout); `503` with a
  fixed body when the database is unreachable. Use for startup and uptime checks.

Both are public, unthrottled, and return no configuration or error text. The service handles
`SIGTERM` (Cloud Run's stop signal) by closing the HTTP server and the database pool.

## Cloud Run outline

These commands are a sketch. They have **not** been run from this repository; check flags against
`gcloud run deploy --help` and your project's setup.

```bash
# Build and push (Cloud Build uses the Dockerfile)
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/REPO/whylint:TAG

# Release job
gcloud run jobs create whylint-release \
  --image REGION-docker.pkg.dev/PROJECT/REPO/whylint:TAG --region REGION \
  --set-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-secrets DB_URL=whylint-release-db-url:latest \
  --command node --args dist/scripts/release.js
gcloud run jobs execute whylint-release --region REGION --wait

# Service
gcloud run deploy whylint \
  --image REGION-docker.pkg.dev/PROJECT/REPO/whylint:TAG --region REGION \
  --allow-unauthenticated --port 8080 \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-env-vars TRUST_PROXY=1,FRONTEND_URL=https://learn.example.com \
  --set-secrets DB_URL=whylint-db-url:latest,JWT_SECRET=whylint-jwt:latest,GEMINI_API_KEY=whylint-gemini:latest,GOOGLE_CLIENT_SECRET=whylint-google:latest
```

Also: point the startup and uptime checks at `/api/v1/health/ready`, map the custom domain, and keep
`--max-instances` small until rate limits move to a shared store (they are in memory per instance).

## Mobile apps

The iOS and Android apps call this same service from `capacitor://localhost` / `https://localhost`.
Set `NATIVE_APP_ORIGINS=capacitor://localhost,https://localhost` on the service and build the app with
`WHYLINT_API_URL` set to the service's public origin; see [mobile.md](mobile.md). Requests from those
origins receive the session token in the response body (kept in the device keystore) instead of a
cookie. Leave the variable empty for a web-only deployment.

## Known gaps before real traffic

See [production-readiness.md](production-readiness.md) for the full list. The ones that change how
this deployment behaves:

- **Google sign-in will not work on a deployed origin yet.** The frontend allowlists only
  `http://localhost:4200` (`frontend/src/app/google-login/google-login.ts`) and the OAuth client has
  no production redirect URI. Password sign-up and sign-in work.
- **Rate limits are per instance** (in-memory throttler), and Gemini spend has no global budget.
- No password reset, email verification, privacy policy, or account deletion (B4, B5).
- The Angular shell has no Content-Security-Policy yet (H5).

## What has been verified

- Unit tests for the TLS settings, probes, and static serving; the compiled output
  (`nest build`) run against a disposable TLS-only PostgreSQL covering every `DB_SSL` mode, a Unix
  socket URL, an idempotent second release run, the app serving the Angular build, SIGTERM exit,
  and the HTTP smoke script (including sign-up and session on one origin).
- **Not verified here:** the Docker image build and `container-smoke.sh` (Docker was not running),
  the GitHub Actions workflow on GitHub, Cloud Build, Cloud Run, Cloud SQL, and TLS against a
  managed database. The first CI run is the first test of the image.
