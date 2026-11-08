# WhyLint on iOS and Android

The mobile apps are the Angular app inside a [Capacitor](https://capacitorjs.com) 8 shell (a WKWebView on
iOS, a WebView on Android). The web build and the app share one codebase; the app adds a few native
pieces. The projects are in `frontend/ios` and `frontend/android`; the config is
`frontend/capacitor.config.ts`.

## How it works

The app bundles its own files for offline shell startup. Loading a fresh learning feed needs the
API. Its pages come from
`capacitor://localhost` (iOS) or `https://localhost` (Android), **not** from the API's origin. That
changes two things compared with the web deployment in [deployment.md](deployment.md):

| | Web | iOS / Android app |
|---|---|---|
| API address | relative `/api` on the page's own origin | baked in at build time (`WHYLINT_API_URL`) |
| Session | `HttpOnly` `SameSite=Lax` cookie the script never sees | token in the response body, kept in the **iOS Keychain / Android Keystore**, sent as `Authorization: Bearer` |
| Who may call the API | `FRONTEND_URL` (exactly one origin) | `FRONTEND_URL` **plus** `NATIVE_APP_ORIGINS` |

A `SameSite` cookie does not follow cross-origin requests from a WebView, and iOS blocks third-party
cookies, so the app cannot use the web's cookie session. The server therefore returns the token in the
body **only** to origins listed in `NATIVE_APP_ORIGINS` (empty by default); the web origin never
receives it. Logging out revokes the server-side session and clears the Keychain item.

Loading the deployed website inside the shell (`server.url`) was rejected: it needs a network just to
start, gets no offline shell, and a wrapper around a website is the kind of app Apple's review rejects.

## What the shell adds

- **Secure session** (`@aparajita/capacitor-secure-storage`), cleared on logout or when the server
  rejects the token. If the keystore is unavailable the session lasts until the app restarts and a
  `Secure storage … failed` warning is logged (the step and message only, never the token).
- **Status bar** style follows the theme from any screen; a strip in the page colour keeps the clock
  readable when a page scrolls under it.
- **Android back button** closes the open sheet first, then goes back, then leaves the app.
- **Haptics** for right/wrong answers and for level, badge, combo and goal toasts.
- **Share sheet** with links that point at the deployed site, not at `capacitor://localhost`.
- **Keyboard** resizes the web view natively; safe areas come from the existing `env(safe-area-inset-*)`.
- **Reading zoom** is enabled in the native WebView. Profile also provides a persisted reading-size
  preference for the learning interface.

Native bridge logging is explicitly disabled because plugin call payloads include session storage
values. Application warnings retain their sanitized step/message format.

## Build and run

Needs Node 24, **Xcode** for iOS, and **Android Studio (or the Android SDK) with JDK 21** for Android.
Capacitor 8's Gradle cannot run on JDK 26. With Homebrew: `brew install openjdk@21`, then run Gradle with
`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` (the formula is keg-only, so it
does not change your default Java). On macOS, if `xcode-select -p` still points at the command line tools,
set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for `xcodebuild`.

Development against a local backend:

```bash
# backend/.env: NATIVE_APP_ORIGINS=capacitor://localhost,https://localhost
npm run start:dev --prefix backend
```
```bash
cd frontend
npm run native:ios        # builds for http://localhost:3000, syncs, opens Xcode
npm run native:android    # same for Android Studio
```

`WHYLINT_API_URL` overrides the dev address. The iOS Simulator reaches the Mac at `localhost`; an Android
emulator needs `adb reverse tcp:3000 tcp:3000` (verified). A physical device needs a LAN address, and iOS
blocks plain `http` to non-local addresses unless you add an App Transport Security exception, which the
project does not.

To build and install the debug app from the command line: `npm run native:build:dev`, then
`cd android && ./gradlew assembleDebug` and `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

Production bundle (https only):

```bash
cd frontend
WHYLINT_API_URL=https://learn.example.com npm run native:build
```

This runs `ng build --configuration production,native` into `dist/native`, bakes in the API origin, and
runs `cap sync`. Then archive from Xcode or Android Studio.

**Run on a signed build.** Do not pass `CODE_SIGNING_ALLOWED=NO` to a build you intend to launch: without
the app's entitlements the Keychain refuses writes (`-34018`), so the session would not survive a
restart. That flag is fine for a compile-only check (CI uses it).

## Before a store release

- **Confirm the app id.** `app.whylint.mobile` in `capacitor.config.ts` is a placeholder and cannot
  change after the first submission.
- Signing, icons, splash assets, store listings, privacy labels, and the account-deletion flow Apple
  requires (readiness item B5).
- **Native Google sign-in.** The button shows "coming soon" in the app: Google rejects OAuth inside
  embedded web views. It needs the system browser or a native SDK, iOS and Android OAuth client IDs in
  Google Cloud, and a backend path that verifies an ID token. Password sign-in works now.
- Universal / app links so shared links open the app, and push notifications for the 09:00 review.
- The page loads its fonts from Google Fonts at runtime; bundle them so the app looks right offline.

## What has been verified

- **Unit and integration:** token store (including the plugin-is-not-a-promise pitfall), the fetch
  wrapper (URL rewrite, Bearer, token capture and clearing, no token to other hosts), shell, haptics,
  share, API origin parsing, the origin guard and controller, and an integration test against
  PostgreSQL (token in the body only for listed origins, cookie for the web origin, logout revokes).
- **Browser stand-in** (`e2e/tests/native-shell.spec.ts`): the native bundle served from its own origin
  calling the API across origins: sign-up, token, reload, a graded answer, and logout.
- **iOS Simulator** (iPhone 16 Pro Max, iOS 26.5, Xcode 27.2): the app builds and runs; the feed loads
  from the API across origins; a bug-of-the-day answer is graded; sign-up and password login work; the
  session survives killing and relaunching the app and is gone after logout; the unreachable-API state
  recovers on retry; the status bar is readable in both themes and when a page scrolls.
- **Android emulator** (API 37, arm64, headless AVD): the debug app builds with JDK 21 and runs; the feed
  loads across origins; an answer is graded; sign-up works with the soft keyboard resizing the page; the
  session survives a force-stop and is gone after logout; the layout clears the system bars; the Back
  button closes the open sheet first and then leaves the app. Two bugs found there are fixed: a race that
  could leave the wrong status bar style on a cold start (updates are now applied one at a time), and an
  onboarding history entry that made Back need an extra press.
- **Not verified:** physical devices, the share sheet, how the haptics feel, Back from routes other than
  the feed and the comments sheet, Android below API 37, and the GitHub CI jobs for both apps.
