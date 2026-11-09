# WhyLint frontend

## Core learning feed extension

Implement the root `specs.md` contract on the user-created core-learning branch.
Replace the static question preview with authenticated five-question generation,
third-card prefetch, written assessment, failed-question practice, progress and
weekly rankings. Expand onboarding to multiple interests, languages/frameworks,
and starting difficulty, with backward-compatible local preference migration and
authenticated server persistence. Add community publishing, likes, comments,
saved questions, and share routes. Preserve existing authentication, optional
username setup, themes, Japanese defaults and English support. No Git commands.

Network failures preserve answer/form drafts, request IDs survive retries, and
account/language changes invalidate stale responses. Guest readers see published
questions and sign-in affordances. No production fixture questions or fake scores.

## Optional usernames and email signup

- Keep Japanese defaults, English support, WhyLint's current colors/layout and
  mobile-native inputs (16px), touch targets (44px), safe areas and keyboard use.
  This expands the existing form design; do not redesign the app.
- A reusable username setup field appears only for authenticated users whose
  username is missing. Show it on onboarding's final step and in Profile.
  Onboarding is optional: a blank field never prevents learning. A supplied
  value is validated/saved before completing onboarding; errors stay inline with
  the selected learning preferences intact. Profile has an explicit save action.
- Use 3–32 Unicode letters/numbers or `._-`, trim username input only, and surface
  unavailable/already-set names, offline/expired-session and rate-limit errors.
  Pending operations disable duplicate submission; profile shows the saved
  username afterward. Existing usernames are displayed instead of an editor.
- Extend AuthUser with nullable username; normalize older profiles missing that
  field to NULL while validating other profile fields. Preserve current logout
  concurrency/timeout handling, avatar fallback and guest-only navigation.
- Add a shared AuthApi for bounded credentialed JSON signup/password-login/name
  mutations, using the existing injectable fetch and AuthSession revalidation.
  Never save credentials/user data in browser storage or expose backend details.
- Add `/signup`, protected by the guest-only guard. The form asks for email,
  username and password, labels the password requirement (15–128 characters),
  supplies password-manager autocomplete, and keeps password bytes unchanged.
  On success restore `/me`, then replace navigation to `/` (onboarding as needed).
  Show validation, conflict, rate-limit, loading, network and retry states.
- Link login to signup and signup to login. Connect the existing password form
  to `/auth/password/login`; preserve Google action/callback/state checks and
  return generic invalid-credentials errors. Remove obsolete coming-soon copy.
- Preserve theme/language preferences on new auth screens. A failed session check
  shows retry rather than credential controls. Authenticated users leave signup.
- Cover true signup → profile → logout → email/username sign-in, optional Google
  username setup on onboarding and Profile, invalid fields and server errors in
  unit plus real-backend mobile/desktop Playwright tests with disposable accounts.
- Backend implementation stays in its own checkout. Update stale signup/password
  UI-only documentation once these flows pass. Restore the dev frontend at 4200
  after fixture testing; real native-device verification remains unclaimed.

## Logout and Google avatar follow-up

- The user confirmed real Google login and requested a logout button and their
  Google picture. Keep these frontend edits in this checkout/branch, using the
  existing account section, Japanese/English copy and mobile-native skill.
- Render `avatarUrl` from the server profile as a circular, fixed-size image with
  object-fit cover and no referrer. Use the existing decorative SVG placeholder
  when the URL is absent or the image fails to load. Keep identity text readable.
- Add a keyboard/touch-accessible Sign out / ログアウト button in the signed-in
  account section. Use at least a 44px target, disable repeated activation while
  pending, and show a localized progress label. Keep the guest account panel on
  successful logout; preserve onboarding, language and local practice progress.
- Add `AuthSession.logout()` for credentialed same-origin POST to the existing
  `/api/v1/auth/logout`, with a bounded timeout and no token/storage access.
  A confirmed 204 clears the in-memory user and sets guest state. HTTP/network
  failure or timeout keeps the known account and shows a retryable error.
  Deduplicate concurrent logout, suppress stale session refreshes, and make any
  refresh during logout wait for its result so an old /me cannot restore a user.
- Test logout success/failure/timeout/repeated activation and refresh races, image
  success/null/error rendering and localized UI. Extend Playwright integration
  tests to click the actual logout button, verify copied-cookie revocation and
  independent-session survival, and display a locally served fixture avatar.
- Build and run frontend tests, check mobile/desktop browser viewports using only
  disposable accounts, and restore the normal dev frontend after integration
  testing. Physical device verification remains separate.

## Scope and isolation

- Work on the frontend-only branch in this separate checkout; do not modify, copy configuration from, or install dependencies into the existing backend checkout.
- Provide a user-facing `/login` route and handle the existing `/auth/google/callback` redirect.
- Integrate with the user's existing backend over the default local dev-server proxy to `/api/v1/auth/login` and `/api/v1/auth/me`; do not add backend routes or change backend configuration.
- The screen is user-facing, while the integration is not yet the final mobile or production authentication flow. Native Google sign-in, backend-bound state/PKCE, CSRF defenses, and deployed cross-origin cookie behavior remain integration work.

## User experience

- Follow the existing WhyLint brand, mobile-first layout, Japanese default and optional English, light and dark colors, safe areas, accessible buttons, and clear errors.
- Configure the public Google OAuth web client ID in frontend source; never ask for, store, display, or log the OAuth client secret, JWT, or authorization code.
- Provide loading, cancel/error, retry and authenticated-profile states. Retain existing onboarding and feed behavior.
- Show a user-facing sign-in screen with an email-or-username and password form alongside Continue with Google. The route is available in normal application builds; the unfinished backend security and deployment integration must be resolved before release.
- Add an account section to Profile. Guests can navigate to `/login`; authenticated users see their verified profile; loading and connection failures are explained with a retry action. Keep the existing local-only practice progress and guest learning flow unchanged.
- The backend now supports cookie clearing and persisted-session revocation; use its logout endpoint for the account sign-out control.

## Email and username forms

- The `/signup` route creates a password account using email, username and an
  unchanged 15–128-character password. `/login` accepts email or username with
  the password through the existing backend endpoint. Both are guest-only.
- Keep Google continuation, callback state checks, localization, loading and
  unavailable-session handling. Link both account forms and use password-manager
  autocomplete, explicit labels, 16px inputs and retryable errors.
- Optional username setup for Google users appears on onboarding's final step
  and in the authenticated Profile. Blank onboarding input skips the write;
  nonempty input saves before learning begins. Display an existing name.
- Never persist credentials or account data in browser storage. Preserve local
  learning preferences, theme/language and current session revocation.

## OAuth and session contract

- Allow the configured local origin `http://localhost:4200`, with the redirect URI derived from that origin. Additional origins must be explicitly configured and registered in Google Cloud after backend security and deployment integration are complete; deployed `/api` requests need an appropriate same-origin reverse proxy.
- Generate cryptographically random one-time state per attempt and store it in session storage. Reject missing/mismatched/reused state, clear it on completion, and immediately remove OAuth parameters from browser history.
- Request `openid email profile` and an authorization code; compare callback state before sending a code to the local backend; send the code as JSON to `/api/v1/auth/login` using same-origin credentials through the development proxy.
- Do not expose a PKCE-protected or production-ready claim: the current backend does not accept a PKCE verifier and its own login-CSRF handling is not implemented.
- After login, request `/api/v1/auth/me` with credentials and render the returned user profile; never read the HttpOnly cookie or put tokens in browser storage.
- Maintain a single in-memory `AuthSession` service. Restore the authenticated user from `/api/v1/auth/me` at app startup, when the app returns to the foreground, and after a successful login, without storing user data or tokens in browser storage. A 401 means guest; network errors, invalid profile responses and server failures mean unavailable. Ignore stale responses when a newer session check has started.
- Revalidate the server session before entering `/login`. Redirect authenticated users to `/` (which can lead to onboarding if needed); allow a confirmed guest to sign in. If the session cannot be checked, show a retryable connection state without treating the user as a guest or exposing sign-in actions. Redirect if a session becomes authenticated while the login page is open.
- Keep the OAuth callback accessible until it has removed the code from the address and consumed/validated state. Check the server session before exchanging a valid code: redirect an already-authenticated user without exchanging it, exchange only for a confirmed guest, and require a fresh sign-in if the check is unavailable. After a successful exchange navigate to `/` with replacement history. A failed or invalid callback must not send an unverified code.
- Bound session-check duration and surface a retryable unavailable state on timeout. The client guard is navigation UX only; backend authorization remains mandatory.
- During an initial guarded navigation, show a localized account-checking state rather than leaving a blank screen while the router awaits the server.
- Verify web Google sign-in and cookie compatibility in mobile browsers on physical devices.

## Acceptance checks

- Fix the existing duplicated homepage language property on this branch, preserving topic filters and the stored-language default.
- Build and run the existing frontend tests, along with targeted tests covering state validation, callback error/malformed cases, cookie-backed requests, and success/error UI.
- Verify restored-session success, anonymous and unavailable states, invalid profiles, stale responses, and guest/authenticated profile rendering. No real account or token should be used by automated tests.
- Verify authenticated/guest/unavailable guard behavior, initial loading, bounded timeout, cookie revalidation, subsequent authentication while `/login` is open, successful callback redirect, and callback cleanup/state rejection without leaking a code.
- Verify both email and username sign-in, signup validation/success/conflicts, optional username setup/skip, translated copy and the existing Google/signed-in states.
- Check desktop and mobile viewport rendering against the existing UI. Real iOS/Android behavior remains unverified without hardware.
- Verify the original backend checkout and its working tree were not modified; application code must not intentionally log credentials, callback query strings, or token values. Clear callback queries to `/login`, and suppress referrers. The initial redirect URL can reach server or proxy logs before the app clears it, so those logs must be redacted.
