# WhyLint native API

The Kotlin and Swift apps use the existing NestJS API and account database. Their
requests use `/api/v1`, JSON bodies, and the same learning payloads as the Angular
client. Native sessions use a bearer token stored in Android Keystore-backed
encrypted storage or the iOS Keychain.

## Authentication

| Method and path | Request | Response |
| --- | --- | --- |
| POST `/auth/mobile/signup` | `email`, `username`, `password` | 201, `{ message, token }` |
| POST `/auth/mobile/password/login` | `identifier`, `password` | 200, `{ message, token }` |
| POST `/auth/mobile/google` | `idToken` | 200, `{ message, token }` |
| GET `/auth/me` | Bearer token | Existing user profile |
| POST `/auth/logout` | Bearer token | 204, server session revoked |
| DELETE `/auth/me` | Bearer token, no body | 204, account and learning data deleted, every session revoked |

Mobile sign-in endpoints reject requests carrying an Origin, Cookie, or browser
Fetch Metadata header. They validate the same signup/password DTOs and retain the
existing rate limits. The Google endpoint verifies the provider's signature,
expiry, issuer and configured server audience through `google-auth-library` before
issuing a WhyLint session. Accounts are matched by verified Google subject.

Mobile requests omit cookies and Origin. Authenticated writes are accepted only
after the existing JWT guard has checked the signature and revocable database
session. Browser cookie flows retain their origin checks. The public guest quiz
tap endpoint additionally accepts requests without cookies, Origin, Fetch Metadata,
or Authorization; guest taps earn no account XP.

The mobile endpoint distinction prevents accidental browser cookie reuse; it is
not device attestation. Native credentials still establish the user's identity.

## Learning

The source contracts live in `frontend/src/app/learning/learning.types.ts` and
`backend/src/learning/learning.controller.ts`. The API supplies catalogs,
preferences, the seeded feed, generated batches, daily challenges, tap grading,
assessment, tutor replies, practice, saved questions, rankings, publication,
comments, helpful votes, creator profiles, and reports.

Use one stable `requestId` when retrying an AI operation whose outcome is uncertain.
Treat 401 as an expired session, 429 as a retryable limit, and provider failures as
recoverable errors. Private attempts and assessment responses must never be
published automatically. Sharing an explanation requires the learner's explicit
submit action.

## Account deletion, reports and blocking

`DELETE /auth/me` permanently deletes the signed-in account (Apple 5.1.1(v), Google Play). It
revokes every session, then removes the user row; foreign keys delete the preferences, attempts,
taps and XP, progress, reactions, comments and helpful votes, reports and blocks the account owns.
Questions the account published stay in the community with `author: null`. The route is guarded
like other bearer writes (no Origin required, a foreign Origin or an ambient cookie is refused) and
is limited to three calls a minute per address. Clients clear their token only after the 204.

| Method and path | Request | Response |
| --- | --- | --- |
| POST `/learning/questions/:id/comments/:commentId/reports` | `reason` (`spam`, `harassment`, `inappropriate`, `other`), optional `details` | 201, `{ id, status: "open" }`; the comment is hidden from the reporter |
| POST `/learning/questions/:id/reports` | `reason` (`incorrect`, `unclear`, `outdated`, `inappropriate`), optional `details` | 201, `{ id, status: "open" }` |
| GET `/learning/blocks` | Bearer token | `{ users: [{ id, displayName, avatarUrl }] }` |
| PUT `/learning/blocks/:userId` | no body | 200, `{ blocked: true }` (idempotent; yourself 400, unknown user 404) |
| DELETE `/learning/blocks/:userId` | no body | 204 |
| GET `/config` | none | `{ legalBaseUrl, supportContact }`, both `null` when not configured |

The server hides a blocked learner's comments (and replies under them), published questions and
public creator page from the blocker (`GET /learning/creators/:id` answers 404). Clients also drop
the blocked learner's questions from the lists they already hold.

## Deployment

The default app API origin is the existing Cloud Run service. These new mobile
authentication routes must be deployed with the backend before release builds can
sign in there. Account deletion, comment reports and blocking need the `AccountSafety1794400000000` migration (`npm run migration:run` or the release job). Google sign-in
also requires native OAuth registrations for the Android package/signing
certificate and the iOS bundle/client ID; public client IDs belong in build
configuration, never a client secret.

Provider setup references: [Google's iOS backend authentication guide](https://developers.google.com/identity/sign-in/ios/backend-auth)
and [Android Credential Manager Google sign-in](https://developer.android.com/identity/sign-in/credential-manager-siwg).

## Local verification

Start the existing disposable stack from the repository root:

```sh
cd e2e
WHYLINT_E2E_FRONTEND_PORT=4330 WHYLINT_E2E_BACKEND_PORT=3130 npm run stack
```

In another terminal:

```sh
node native/scripts/verify-api.mjs
```

The script uses only the dedicated loopback API, creates a synthetic test account,
checks guest grading and authenticated writes, and verifies session revocation.
No token or password is printed. Stop the stack with Ctrl-C to delete its temporary
PostgreSQL database. The iOS Simulator can reach `http://127.0.0.1:3130`; an Android
emulator can reach the same service through `http://10.0.2.2:3130`.
