# WhyLint production-readiness audit

Date: 2026-11-08 · Scope: `backend/`, `frontend/`, `e2e/` on `feat/core-learning-feed` (working tree)
Assumption: a public launch, not a hackathon demo.

## Verdict

**Not ready for a public launch yet.** The application core is strong: authentication, answer
secrecy, idempotent AI operations, XP integrity, and test coverage held up under a white-box
penetration test. The gaps are in operations, account lifecycle, legal, and cost control.
Eight blockers below need to be closed first; most are configuration and process, not rewrites.

## Blockers

| # | Area | Finding | Evidence | Fix |
|---|------|---------|----------|-----|
| B1 | Source control | All work, including the whole learning engine, is uncommitted on one laptop. | `git status`: 100+ changed and untracked files; `feat/core-learning-feed` equals `main`. | Commit in reviewable chunks, push, open a PR, protect `main`. |
| B2 | Deployment | No container, infrastructure config, CI pipeline, or health endpoint. The frontend calls a relative `/api` and the session cookie is `SameSite=Lax`, so the app and API must share an origin. | No `Dockerfile`/IaC; `learning-api.ts` uses `/api/v1/learning`; `auth.controller.ts` cookie options. | One Cloud Run service serving the built Angular app and the API (or a path-based load balancer). Do not use Firebase Hosting rewrites: they strip every cookie except `__session`. Add `GET /api/v1/health`. |
| B3 | Database | TLS is hard-coded off. Migrations are run by hand with ts-node. | `backend/src/datasource.ts` (`ssl: false`); `package.json` `migration:run`. | Make TLS configurable (or use the Cloud SQL Unix socket). Run migrations and `npm run pool:seed` from compiled `dist` as a release job (pattern: `e2e/scripts/backend.cjs`). Least-privilege DB user. Automated backups and point-in-time recovery. |
| B4 | Accounts | No password reset and no email verification. A user who forgets a password is locked out; anyone can register any address. | No reset/verify routes in `backend/src/auth`. | Email verification and password reset with signed, single-use, expiring tokens; rate-limited. |
| B5 | Privacy and legal | No privacy policy, terms, or account deletion/export. Public profiles and the leaderboard fall back to a Google account's real name when no username is set. | `community.service.ts` `publicAuthor`, `assessment.service.ts` leaderboard (`username \|\| name`). | Publish policies (APPI; GDPR if serving the EU). Self-serve account deletion and data export. Require a username before appearing publicly, or show "Learner". Decide minimum age. |
| B6 | AI data use | Learner answers and follow-up questions are sent to the Gemini API. On the free AI Studio tier, Google may use prompts and responses to improve its products. | `gemini.service.ts` sends answers verbatim. | Use a paid tier or Vertex AI with data-use terms you can disclose. State it in the privacy policy. Keep the existing no-payload logging. |
| B7 | Cost and abuse | Gemini spend is limited only per user (10 calls a minute per kind). Signup has no bot protection, so many accounts multiply spend. Rate limits are in memory per instance. | `learning-operations.service.ts` budgets; `auth.module.ts` throttler storage. | Global daily Gemini budget with alerting and pool-only fallback when exceeded. CAPTCHA on signup (reCAPTCHA Enterprise or Turnstile). Shared throttler storage (Redis/Memorystore) once there is more than one instance; set `TRUST_PROXY=1` on Cloud Run. |
| B8 | Secrets | Secrets live in a local `.env`. The Google sign-in origin allowlist is hard-coded to `http://localhost:4200`. | `backend/.env`; `frontend/src/app/google-login/google-login.ts:14`. | Secret Manager for `GEMINI_API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `DB_URL`; rotation plan. Make the allowlist per-environment and register production OAuth redirect URIs. |

## Progress since the audit

| Item | Status |
|------|--------|
| B2 deployment | **Mostly done in code**: root `Dockerfile` serving the Angular build and the API from one origin, `GET /api/v1/health` and `/health/ready`, SIGTERM handling, CI workflow. Not yet built in Docker or run on GitHub/Cloud Run; see [deployment.md](deployment.md). |
| B3 database | **Partly done**: `DB_SSL` (`off`/`verify`/`no-verify`) with CA from env or file; compiled release job (`npm run release`) for migrations and the pool; Unix-socket URLs verified locally. Still open: least-privilege roles, backups and point-in-time recovery, TLS against a managed database. |
| B7 | `TRUST_PROXY` is documented for Cloud Run. Global Gemini budget, signup CAPTCHA, and shared rate-limit storage are still open. |
| H6 dependency | `multer` is pinned to 2.5.0 through an npm `overrides` entry (`npm audit fix` cannot fix it on Nest 11); `npm audit --omit=dev` is clean in all three packages and runs in CI. Remove the override on the move to Nest 12. |

## High

| # | Finding | Fix |
|---|---------|-----|
| H1 | No observability: no structured logs, error tracking, uptime checks, or metrics for Gemini latency, failure reasons, and spend. | Cloud Logging with JSON logs, Error Reporting/Sentry, uptime check on `/health`, dashboards and alerts for Gemini `reason` codes and 5xx rates. |
| H2 | Moderation: question reports are stored but nobody can act on them; comments cannot be reported; no spam or abuse filtering. | Admin review queue for reports, comment reporting, basic spam and abuse filtering, ability to hide content and suspend accounts. |
| H3 | Content accuracy: the 179 pool questions and every generated question are AI-written without human review. | Human review of the pool before launch; route reports into the review queue; track per-question "incorrect" report rate. |
| H4 | Data retention: `learning_operations` keeps the full JSON result of every feed batch and AI call forever (about 2.3 KB per batch). | Scheduled cleanup (for example, results older than 30 days). Retention policy for taps, attempts, comments. |
| H5 | Frontend host headers: the SPA needs a Content-Security-Policy, HSTS, and `frame-ancestors`. The API now sends baseline headers (`backend/src/http-hardening.ts`). | Strict CSP compatible with Angular, HSTS, `frame-ancestors 'none'` at the hosting layer. |
| H6 | Dependency: `multer` has two high-severity advisories (transitive via `@nestjs/platform-express`). No upload routes exist, so it is not reachable today. | `npm audit fix` in `backend/` and keep `npm audit --omit=dev` in CI. |
| H7 | Time zone: streaks, the daily goal, the leaderboard week, and the 09:00 Practice reviews all use Asia/Tokyo for every user. | Fine for a Japan-only launch. For international users, store a user time zone and schedule per user. |

## Medium

- **Answer reveal (accepted risk).** Any tap returns the correct option, including for logged-out callers, because shared links must work for guests. Combined with multiple accounts, tap XP (5 per question) can be farmed. Keep the leaderboard weighted toward Gemini-graded explanations (15 XP), and flag outliers.
- **Explanation after a fail.** The full explanation is shown on a failed attempt, so a learner can paste it back to pass. Consider hiding it until a second attempt or showing improvements only.
- **Synchronous generation.** A personalized batch is generated inside the HTTP request (60 s budget, 75 s client timeout). The pool hides it today; at scale, move generation to a background job.
- **Reminders.** The 09:00 Practice review appears only when the learner opens the app. Add web push or email reminders.
- **Share previews.** Shared `/questions/:id` links have no Open Graph metadata (client-rendered), so previews are blank.
- **Mobile apps.** Capacitor 8 is set up (iOS and Android projects, secure token session, status bar, back button, haptics, share sheet); see [mobile.md](mobile.md). Still open: native Google sign-in, push reminders, universal/app links, store assets and signing, and a build on a device.
- **Lint debt.** ESLint reports hundreds of `no-unsafe-*` errors from untyped raw SQL results. Add typed row interfaces and make lint part of CI.
- **Google sign-in E2E** requires port 4200; run it in CI where that port is free.

## White-box penetration test (2026-11-08)

Method: code review of all 33 API routes, the frontend's rendering sinks, and token handling,
plus an automated probe against the running API as a guest and as a signed-in learner.

| Area | Result |
|------|--------|
| Answer secrecy (pool, daily, community, question, comments, leaderboard) | Pass: no reference answers, rubrics, or correct options before a tap |
| Authentication on private routes; forged `alg: none` token | Pass |
| CSRF: writes without or with a foreign `Origin`; form-encoded writes | Pass: 403 / 415 |
| CORS for foreign origins | Pass |
| SQL injection through query parameters and IDs | Pass: parameterized; IDs validated |
| Unknown and oversized fields; `__proto__` payloads | Pass: validation still applied. Hardened: such keys now rejected (400) |
| Ownership: deleting or voting on others' comments, cross-question deletes | Pass |
| Follow-ups as an answer oracle | Pass: requires answering first |
| XP integrity under 10 concurrent first taps | Pass: XP awarded once |
| Rate limits on public reads | **Fixed**: were unlimited; now 120/min per learner or IP |
| Response headers | **Fixed**: `X-Powered-By` removed; `nosniff`, `X-Frame-Options`, `Referrer-Policy`, CORP; HSTS in production |
| Formatter cost on public lists | **Fixed**: formatted snippets cached |
| XSS sinks in the frontend | Pass: no `innerHTML`, sanitizer bypass, or `eval` |
| Guest tap reveals answers for any ID | Accepted risk (see Medium) |

Functional bugs found and fixed in the same pass: reworded repeat questions across sessions;
Practice questions opened from the Practice tab could not be answered again; a morning review
of a card seen the night before was dropped; answer-revealing comments were visible before
answering; two migrations shared a timestamp; guest pool requests could build ~11 KB URLs.

## In good shape

- Passwords hashed with Argon2; revocable server-side sessions; HS256 pinned; `HttpOnly`,
  `Secure`, `SameSite=Lax` cookie; Origin checks and JSON-only writes; strict DTO validation.
- AI operations are idempotent with leases, budgets, and replay; provider failures never become
  failing grades; prompts treat user content as untrusted; no payload logging.
- Instant tap grading needs no AI; a seeded question pool keeps the feed working when Gemini is
  slow or down; concept-level novelty prevents repeats.
- Tests: 212 backend unit, 47 integration on disposable PostgreSQL, 174 frontend unit,
  Playwright on mobile and desktop.
- Accessibility basics: focus management, reduced-motion support, keyboard shortcuts, ja/en.

## Launch checklist (in order)

1. Commit, push, and review the current work (B1).
2. Container, single-origin Cloud Run service, health check, CI with tests and `npm audit` (B2, H6). *Written and verified on the host; the image and workflow have not run yet.*
3. Cloud SQL with TLS or socket, backups, release-job migrations and pool seeding (B3). *TLS setting and release job done; Cloud SQL, roles, and backups open.*
4. Secret Manager, production OAuth origins, `TRUST_PROXY=1` (B8, B7).
5. Paid Gemini tier, global budget and alerts, signup CAPTCHA, shared rate-limit store (B6, B7).
6. Password reset and email verification (B4).
7. Privacy policy, terms, account deletion and export, public-name rules (B5).
8. Observability, moderation queue, pool content review, retention job, frontend CSP (H1–H5).
