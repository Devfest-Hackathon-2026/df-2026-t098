# WhyLint native apps: UI/UX and production-readiness audit — 2026-11-09

Scope: `native/ios` (SwiftUI), `native/android` (Jetpack Compose), the mobile auth boundary in
`backend/`, and the web app as a regression check. Working tree of `native/native-apps`
(HEAD `6769be2`, 129 uncommitted files). Nothing was committed or changed in source for this audit.
Skills applied: `ui-audit` (report structure), `improve-animations` and `review-animations` (motion),
`apple-design` (gestures, sheets), `write-swift` (Swift review), `impeccable` (native screens).

## Verdict

**Production readiness: functionally sound, not ready for store submission.** The API boundary holds
under adversarial probing, the release builds work, and the production service already serves the
mobile routes. What blocks submission is store policy and account lifecycle, not engineering:
there is no account deletion, no way to report a comment or block a user, no privacy policy link,
no Sign in with Apple alternative alongside Google, and the iOS bundle is missing the privacy manifest.
Six blockers (N1–N6); each is a small, well-scoped piece of work.

**UI/UX: the native apps match the web look and read well, but trail it in feedback and motion.**
The iOS launch flashes white on a near-black app, the iOS answer state hides which line you picked,
and almost nothing animates on either platform. Details and fixes are below.

## Fix pass (same day)

The small issues were fixed after the audit. Status as verified, not as intended:

| Finding | Status | How it was checked |
|---|---|---|
| U-1 iOS white launch frame | **Fixed for the common case.** `LaunchBackground` color asset (light `#F3F5F0`, dark `#080808`) set as the launch color. A launch screen cannot read saved preferences, so a user whose saved theme differs from the system theme still sees the system color first. | Launch frames sampled `#F3F5EF` instead of `#FFFFFF`; built bundle contains the asset catalog |
| U-2 answer marking and VoiceOver | **Fixed on both.** The wrong pick is tinted and carries a ×, the correct row a ✓ (not color alone); rows and choices expose "Your answer, correct/incorrect" or "Correct answer"; iOS announces the result. iOS reads the pick from `tap.choice`, so restored answers are marked too. | Screenshots on iPhone 17 and the Android emulator; new UI assertion on the iOS answer value passes |
| U-3 motion and haptics | **Partly fixed.** iOS: success/error haptics instead of one light impact, 180 ms ease-out on row, choice and banner states, off under Reduce Motion. Android: no haptics or animation added yet. XP float and tab crossfade still open. | iOS UI tests pass; not felt on a device |
| U-6 banner parity | **Fixed.** Android banner has the icon, Japanese copy matches iOS (`おしい！`), and the red and green rows span the full code width (they were text-width). | Emulator screenshot |
| N5 (a) privacy manifest, (b) encryption flag, (c) iPad orientations | **Fixed in the files.** `PrivacyInfo.xcprivacy` (UserDefaults `CA92.1`, no tracking, five collected data types: email, name, user ID, user content, product interaction); `ITSAppUsesNonExemptEncryption = NO`; four iPad orientations. The data-type list and the encryption answer are my reading of the code: **please review them, they are declarations to Apple.** Not validated by an upload. | Built bundle contains the manifest; `plutil` lint; built Info.plist keys read back |
| H-N3 offline logout | **Fixed on both**: the local token is always cleared, the server revoke is best-effort. Not tested offline. | Online logout passes in the iOS UI test; Android compiles and runs |
| U-11 UI tests | **Fixed.** `--language ja` DEBUG launch argument (in memory only), pinned in every test; outcome assertion accepts both labels. | **8 of 8 pass** on iPhone 17 (190 s) |

Still open: N4, N5(d) signing team, N6, H-N1, H-N2, H-N4–H-N6, U-4, U-5, U-7–U-10, Android haptics and motion.

## Store blockers N1–N3 (same day)

Code for N1, N2 and N3 is in place on the backend, the web app, iOS and Android. They stay **open for
submission** until the owner publishes the privacy policy and terms, sets the real support contact and
the stores accept the build. Evidence is in `specs.md` ("Store blockers N1–N3") and below.

**Not verified:** the Android UI was not run. The emulator would not boot in that session (QEMU's watchdog
exits during start), so `native/android/qa/safety_smoke.py` is written but has never been executed; Android
is checked by `assembleDebug`, `assembleRelease` and `lintDebug` (0 errors, 42 warnings, as before). No
physical device, no VoiceOver/TalkBack session, no App Store Connect or Play upload.

| Blocker | Status | How it was checked |
|---|---|---|
| N1 account deletion | **Code complete on all four surfaces.** `DELETE /auth/me`; Profile action with confirmation on web, iOS, Android; the token is cleared only after the 204. Published questions stay with no author. | Backend integration (cascade of every user-owned table, bearer with no Origin, cookie with Origin, revoked token, re-registering the same email, other learners untouched); Playwright; iOS UI test. Android: compiled and linted only. |
| N2 UGC safety | **Mostly done.** Comment reports, user blocks (hidden server side and client side: comments, replies under them, published questions, creator page, saved list), `inappropriate` question-report reason, support contact. **Not done:** the basic content filter, a moderation review queue (reports are rows nobody reads yet), and blocked users still show on the weekly ranking. | Backend integration; Playwright report → block → unblock; iOS UI test. Android: compiled and linted only. |
| N3 legal links | **Code complete, documents missing.** One base URL per platform (`LEGAL_BASE_URL`, `WHYLINT_LEGAL_URL`) appends `/privacy` and `/terms`; shown on sign-in and in Profile everywhere. The default points at the Cloud Run origin, where no such pages exist yet. | Playwright reads the link targets; iOS UI test finds the links. Android: compiled and linted only. |

**Two corrections to the findings above:**
- **U-5 was misstated.** The app does follow the system appearance until a theme is chosen
  (`AppStore.swift:51–53`); the dark app on a light simulator came from a saved preference. The real gap is that Settings offers Dark and Light only, so there is no way back to "System" once one is chosen.
- **U-11's cause was misdiagnosed.** The app's language is its own saved setting (default `ja`), not the simulator language. The English-layout test saves `en`, which then leaks into later tests and later runs; the test suite never pinned it. Passing under `-testLanguage ja` earlier was a coincidence of the saved state, not a fix.

## How it was tested

Real stack, no mocks of the app's own code: disposable PostgreSQL + the real NestJS backend on
`:3130` (Gemini and Google isolated by fixtures).

| Surface | What was done |
|---|---|
| Backend | `tsc` clean; unit 269/269 (25 suites); integration 51/51; `npm audit --omit=dev` clean in backend, frontend, e2e |
| Web (regression) | Unit 226/226; production build 280.41 kB, no budget warnings; Playwright 51 pass / 3 skipped / 10 fail (all 10 are Google-fixture tests that need port 4200, same as baseline) |
| Native API | `native/scripts/verify-api.mjs`: 25/25. New adversarial probe of the auth boundary: 32/32 (below) |
| iOS | Built for Simulator; ran on iPhone 17; guest walk through Feed, answer, Practice, Ranking, Profile; XCUITest suite (8 cases); measured launch frames |
| Android | `assembleDebug`, `lintDebug`, `assembleRelease` (R8); ran debug on an API 37 emulator (answer feedback, retry path); signed the release APK with a throwaway key and ran it against production |
| Production | Probed the Cloud Run service the release builds point at (health, readiness, feed, catalog, mobile routes) |

### Auth boundary probe (32/32)

Mobile signup is refused with an `Origin`, a `Cookie`, or Fetch Metadata (403) and as a form post
(415); unknown fields (400) and short passwords are rejected; the token response is `no-store`
with no `Set-Cookie`. Tampered and `alg: none` tokens are refused. A bearer write needs no
`Origin`, a bearer write with a foreign `Origin` is refused, and a valid bearer **plus a cookie**
cannot use the bearer bypass (403). Guest taps are graded; taps from a foreign origin are refused.
Bad, oversized, and missing Google ID tokens are refused. Logout revokes the server session
(the same token returns 401). Mobile password login is rate-limited at 10 a minute.
(Script: scratchpad `pr/probe.mjs`; say if you want it added to `native/scripts/`.)

## Production readiness — native

### Blockers for store submission

| # | Area | Finding | Evidence | Fix |
|---|---|---|---|---|
| N1 | Account lifecycle | **No account deletion** in either app or the API. Apple 5.1.1(v) and Google Play both require in-app deletion for apps that create accounts (Play also needs a web link). | No `DELETE` account route in `backend/src/**/*.controller.ts`; no delete-account UI in `native/**`. | `DELETE /auth/me` (revoke sessions, delete or anonymise content, remove XP rows) plus a confirmed Profile action on both apps. Closes B5 for deletion. |
| N2 | User-generated content | Comments and published questions are public, but only **questions** can be reported; comments cannot be reported, users cannot be blocked, and there is no published contact. Apple 1.2 requires filter, report, block, and contact. | `learning.controller.ts` has `POST questions/:id/reports` only; native report UI is question-only (`QuestionView.swift:376`, `Ui.kt:1794`). | Report-comment route and sheet, block-user (hide their content client-side and server-side), a support contact, a basic content filter. Closes H2 for the stores. |
| N3 | Legal | No privacy policy or terms link in either app; App Store privacy labels and the Play Data safety form cannot be completed truthfully without one. Gemini receives learner text (B6). | No privacy or terms strings in `native/**`. | Publish policy and terms; link both on the sign-in screen and in Profile; fill the store forms from the real data flows (email, username, answers, comments, device-local theme/language). |
| N4 | iOS review | Google sign-in is offered **without Sign in with Apple or an equivalent**. Apple 4.8 requires an equivalent privacy-preserving option when a third-party login is offered. This is a likely rejection; it was not tested against App Review. | `GoogleLogin.swift`; no `AuthenticationServices` import anywhere in `native/ios`. | Add Sign in with Apple (needs a backend `POST /auth/mobile/apple` that verifies Apple's identity token), or drop Google on iOS. |
| N5 | iOS build | (a) **No `PrivacyInfo.xcprivacy`** while `UserDefaults` is used (`AppStore.swift:6–26`): Apple rejects required-reason API use without a manifest. (b) `ITSAppUsesNonExemptEncryption` is absent, so every upload asks the export-compliance question; an app that only uses OS-provided HTTPS normally sets it to `NO` (confirm for your case). (c) The app targets iPhone and iPad (`TARGETED_DEVICE_FAMILY 1,2`) but declares only three orientations and no `UIRequiresFullScreen`, which the iPad multitasking validation rejects. (d) The signing team lives only in the generated Xcode project, not in `project.yml`, so `xcodegen generate` silently drops it (it did during the fix pass; restored by hand). Put it in a local xcconfig. No entitlements file. | `find` shows no manifest outside `build/`; `Info.plist:13` lists three orientations; `project.yml:16`. | Add the manifest (UserDefaults reason `CA92.1`, no tracking, collected data linked to the user). Set the encryption key to `NO`. Add `UISupportedInterfaceOrientations~ipad` with all four, or limit to iPhone. Set the team. (c) is likely, not confirmed by an upload. |
| N6 | Android build | Release has **no signing config**, `versionCode 1` is set by hand, and the Play upload must be an AAB (`bundleRelease`). R8 is on and the minified build launches, but `proguard-rules.pro` is a comment only and `shrinkResources` is off. | `app/build.gradle.kts:17–25`; the 3.0 MB `app-release-unsigned.apk`. | Add a signing config fed from CI secrets or Play App Signing, derive `versionCode` from CI, build an AAB, enable `shrinkResources`, run the Play pre-launch report. |

### High

| # | Finding | Evidence | Fix |
|---|---|---|---|
| H-N1 | **Cold start breaks the first launch.** The production service scales to zero. The first two probes each timed out at 15 s (curl exit 000), the third answered, and a minute later the same endpoints took 0.3–0.5 s. The native clients time out at 10 s (Android connect) and 15 s (iOS). On the release build the first onboarding screen showed "Reload topics" with Next disabled until a manual reload. | `curl -m 15` on `/health` and the first release-build launch. Not proven to be the only cause of that screen, but it matches the timing. | `--min-instances=1` (plus CPU boost) on Cloud Run; one automatic retry with backoff on the first catalog and feed load; show a skeleton instead of an error. |
| H-N2 | **No crash reporting or analytics** in either app (no logging calls either, which is good for privacy). A launch failure like the one above is invisible. | No `Log.`/`print`/SDK usage in `native/**`. | Crashlytics or Sentry on both, with no payload capture. |
| H-N3 | **Logout fails offline and keeps the token.** Both apps call the server first and only then clear the local token, so with no network the user stays signed in on a device they meant to sign out of. | `AppStore.swift:186–191`, `AppModel.kt:252–254`. | Clear local state first, then best-effort revoke (the 30-day token still expires server-side). |
| H-N4 | **Mobile signup and login are protected only by a per-IP throttle** (10 a minute, verified). Account farming multiplies Gemini spend. Same root as B7. | Probe result 429 after 10 tries. | App Attest / Play Integrity token on the mobile signup route, alongside the global Gemini budget. |
| H-N5 | **CI does not guard the native apps.** It builds Android debug and compiles iOS for Simulator only. No native tests, lint, release build, or `verify-api.mjs`. Android has no test sources at all. | `.github/workflows/ci.yml`; `find native/android -path '*test*'`. | Add `lintDebug`, `assembleRelease`, `verify-api.mjs` against the CI stack; an Android instrumented smoke test; run the iOS UI tests (see U-11). |
| H-N6 | **Android Google sign-in sends no nonce** to `GetSignInWithGoogleOption`, so an intercepted ID token can be replayed within its lifetime. The backend checks audience and `email_verified` but cannot check a nonce. | `Ui.kt:1013`. | Generate a nonce, pass it to Google, and verify it in `googleSession`. |

### Medium and low

- **Cleartext allowance ships in iOS Release.** `NSAllowsLocalNetworking` is in the single `Info.plist` (`:15`), so release builds carry it. Move it to a Debug-only plist. Release code is HTTPS-only already.
- **Custom-scheme deep link** (`whylint://questions/<id>`): any app can register the same scheme. The payload is a validated question id, so the impact is small. Move to Android App Links and iOS Universal Links before launch.
- **Token write uses `commit()` on the calling thread** (`Api.kt:81,89`) and the Keystore read happens at launch; both are small, but do them off the main thread.
- **`m.focused!!`** (`Ui.kt:138`) is safe under Compose snapshot reads today, but fragile.
- **Dependencies are about a year behind** (lint: Compose BOM 2025.10 vs 2026.09, Credentials 1.5 vs 1.6, Gradle 8.14.3 vs 8.14.6). 24 unused `web_*` vector drawables in Android resources. A linker warning set from `AppCheckCore` (a Google Sign-In dependency) appears on iOS builds; not actionable here.
- **Still open from the 2026-11-08 web audit:** B4 password reset and email verification, B6 Gemini data terms, B7 global Gemini budget, CAPTCHA and shared rate-limit store, B8 Secret Manager and per-environment OAuth origins, H1 observability, H3 pool content review, H4 retention, H5 CSP, H7 Tokyo-only time zone (the Practice screen tells every guest "9:00 (Japan time)").

### Resolved or better than assumed

- The production Cloud Run service **already serves the mobile routes**: `/auth/mobile/signup` and `/auth/mobile/google` return Nest validation errors, `/health`, `/health/ready`, `/learning/feed/pool` and `/learning/catalog` return 200. The earlier assumption that mobile auth still had to be deployed no longer holds.
- Keychain session restore across termination and relaunch, and logout, pass in the iOS UI test (language pinned to Japanese by the new launch argument, see U-11).
- The R8-minified release build (3.0 MB against 22 MB debug) installs and launches with no crash signature in logcat, then loads topics from production. Lint: 0 errors, 42 warnings.
- Token storage is correct on both platforms: Keychain `AfterFirstUnlockThisDeviceOnly` and Android Keystore AES-GCM; no cookies, no redirects, no logging; `allowBackup=false` and data-extraction rules exclude everything.

## UI/UX — native

Dark theme was inspected on screen; Light, iPad, tablet and landscape rely on the existing UI tests and
the earlier evidence in `native/ios/evidence/`, not new screenshots.

### Priority fixes

**U-1. iOS launches with a white frame in a near-black app — HIGH.** `Info.plist:11` is
`<key>UILaunchScreen</key><dict/>`, an empty launch screen. On a warm relaunch, the first two frames
(about 2 s) sampled `#FFFFFF`, then `#151515`/`#090909`; the first-launch screenshot was also
white. Android is correct: `#080808` from the first frame.
*Fix:* add a `LaunchBackground` color asset (`#080808` dark, `#F3F5F0` light) and set
`UILaunchScreen` → `UIColorName`. Show the wordmark skeleton until `restoreSession` resolves.

**U-2. iOS hides which answer you picked, and the result is color-only — HIGH.** After a wrong answer
the correct line gets a 15% green tint and nothing marks your pick (`QuestionView.swift:235–268`,
choices at `:292–316`). The only signal that you were wrong is the "Not quite" banner. Android does
mark the wrong pick red and the right line green, so the platforms disagree. For VoiceOver, row labels
are static ("Line 3: …"), so the correct line and your pick are never announced.
*Fix:* keep `selected`, draw a danger state with an icon (`xmark.circle`) on the pick and a
`checkmark.circle` on the correct row; add `accessibilityValue("Correct answer" / "Your answer")` and
post a `UIAccessibility.announcement` with the result. On Android add an icon to the result banner too.

**U-3. Almost nothing moves — MEDIUM (parity with the web).** Across all iOS sources there is one
`withAnimation`/`.transition` and no Reduce Motion handling; Android has one animation call in 3,187
lines and no haptics. The answer reveal, result banner, XP gain, card change and tab change all snap.
The web has the `xp-float`, the paging settle, and a fitted reveal row. Add (a) a 150–200 ms
ease-out on the banner and row states, (b) a short XP float, (c) haptics: `UINotificationFeedbackGenerator`
`.success`/`.error` instead of the single light impact for both outcomes (`QuestionView.swift:327`),
`HapticFeedbackType` on Android. Gate each on Reduce Motion / "remove animations".

**U-4. Long code lines are clipped with no hint they scroll — MEDIUM.** `username.tri`, `SELECT * FROM u`
and `greeting + , + na` end at the card edge on both platforms. The horizontal `ScrollView` shows no
indicator until touched. *Fix:* a trailing 24 px fade on the code block, or visible scroll indicators;
a leading-edge fade once scrolled.

**U-5. No way back to "System" appearance — MEDIUM.** The app follows the system until a theme is
chosen, but Profile → Settings (`Panels.swift:487–488`) offers only Dark and Light, so once chosen it
cannot follow the system again, and the launch color cannot match. Add a "System" option that clears
the saved preference.

**U-6. The iOS and Android answer banners differ — LOW.** iOS shows an icon with "おしい！" / "Not quite";
Android shows "不正解" with no icon. Android's red row ends at the text width while the green row spans the
card, which reads as an uneven highlight. Match the copy and make both rows full width.

**U-7. Practice speaks to someone who has missed questions — LOW.** A guest with 0 answers sees
"Come back with a fresh perspective… Missed questions return every morning at 9:00 (Japan time)".
Show an empty-state ("Answer a few questions; misses come back here") for guests, and the local time.

**U-8. Large empty band inside the card — LOW.** On a 6.3-inch phone the code block sits at the top and
the actions at the bottom with about 190 pt between them. Not a defect, but the card could vertically
center the question and answer, or use the space for the result row so it does not look unfinished.

**U-9. Reading-size options wrap unevenly — LOW.** "Larger" falls to a second row alone beside an empty
cell; make it a three-segment control or a single column.

**U-10. Failed first load — LOW (UX is good, add a retry).** Android's connection error ("couldn't
connect, your input is saved") with a Retry button is clear and kept my state. Add an automatic first
retry (see H-N1) so cold start never reaches the user.

### Test-suite findings (iOS)

**U-11.** *(Fixed in the fix pass; the original finding is kept for the record.)* The suite did not
pass as shipped: **6 of 8** on the first run. `testSignupPreferencesSessionPersistenceAndLogout` waited
for the Japanese `次へ` and `学習を始める` while the app was in English, and
`testGuestQuizAndLoginValidation` accepted `正解`, `考えて` or `Correct` but the wrong-answer label is
`おしい！` / `Not quite`, so it passed only when the first answer happened to be right. The root cause was
that the tests pin theme and reading size but not the app's saved language, and the English-layout test
leaves `en` behind. `native/ios/README.md` said the eight cases pass; that was not reproducible until
the fix. The tests also change the app's saved language in the simulator container.

### What passed

- Feed, Practice, Ranking, Profile and answer reveal render correctly on iPhone 17 and a 1080×2400
  Android emulator; the five-tab bar, header chips, and guest CTAs are consistent across platforms.
- The headline is large and legible; per the code, tap targets have 44–48 pt minimums (not measured on screen). Japanese line breaking was not checked on the native apps.
- iOS landscape, larger text, settings appearance, assessment/publish and saved-question tests pass.
- Android's launch is correct (dark from the first frame), recovery from a failed load is one tap, and
  the minified release build behaves the same as debug.

### Native motion inventory

| Moment | iOS | Android | Verdict |
|---|---|---|---|
| Launch | White frame, then content | Dark, then content | iOS defect (U-1) |
| Tab switch | System crossfade only | Snap | Acceptable; add a short crossfade on Android |
| Answer reveal | Snap; haptic light | Snap; none | Add 150–200 ms ease-out and outcome haptics (U-3) |
| XP / streak | None | None | Web has `xp-float`; add |
| Sheets | System | Material | Good |
| Reduce Motion | Not handled | Not handled | Required once the above is added |

## What was not verified

- **Physical devices.** The swipe-paging fix for the stuck-scroll bug is a web fix and its feel on a real
  iPhone is yours to confirm; native scrolling was not tested on hardware.
- **iPad, tablet and Android landscape** screenshots; **VoiceOver and TalkBack** sessions; **Light theme**
  screenshots in this pass.
- **Android sign-up through the UI**, and **Google sign-in** on either platform (needs the real client
  IDs and a Google account).
- **App Store Connect validation and Play pre-launch report**: N4, N5(c) and N6 come from policy and
  file inspection, not an upload.
- **The Docker image** (Colima is stopped; I did not start it) and the CI workflow on GitHub.
- **Cold start duration** itself: I saw one 15 s timeout, not a measured distribution.

## Side effects to know about

- The iOS UI tests ran on your `iPhone 17` simulator and left the app in Japanese. Change it back under
  Profile → Settings, or erase the app's container.
- I installed a throwaway-signed release APK on the emulator (keystore and APK are in the session
  scratchpad, not the repo) and left the test stack running until the end of this session.
- The first pass changed no source; the fix pass changed the native sources listed in `specs.md`. Nothing is committed.

## Fix order

1. N1 account deletion, N2 comment reporting and blocking, N3 policy links — they gate both stores.
2. N4 Sign in with Apple, N5 iOS manifest/encryption/orientation/team, N6 Android signing and AAB.
3. H-N1 cold start, H-N2 crash reporting, H-N3 offline logout.
4. U-1 launch screen, U-2 pick marking and VoiceOver, U-3 motion and haptics.
5. U-11 tests, H-N5 CI, H-N4 attestation, H-N6 nonce, then the medium and low items.
