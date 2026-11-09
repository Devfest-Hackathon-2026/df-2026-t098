# WhyLint Android

A Kotlin / Jetpack Compose app with native Android UI. The Angular app is the visual reference; Android renders its own controls, text, code, paging, settings and sheets.

Open this directory in Android Studio. It needs Android SDK36 and JDK21. Set `ANDROID_HOME` or an ignored `local.properties` with `sdk.dir`. DM Sans and DM Mono are bundled under their SIL Open Font licenses. Google's supplied G artwork is used only on the Google sign-in action.

```sh
./gradlew assembleDebug
```

The default API is the existing WhyLint Cloud Run origin. It must have the new `/api/v1/auth/mobile/*` routes deployed before native sign-in works there. The app sends Bearer tokens without cookies or an Origin header; tokens are encrypted with an origin-specific Android Keystore key, excluded from cloud backup/device transfer, and cleared on confirmed logout or invalidation. AI failures preserve input and expose retry states.

For the existing local backend on port3000 (Android Emulator):

```sh
./gradlew assembleDebug -PWHYLINT_API_URL=http://10.0.2.2:3000
```

For the disposable local stack used in this implementation:

```sh
./gradlew assembleDebug lintDebug -PWHYLINT_API_URL=http://10.0.2.2:3130
mkdir -p qa/builds
cp app/build/outputs/apk/debug/app-debug.apk qa/builds/whylint-fixture-debug.apk
python3 qa/ui_smoke.py
```

`qa/ui_smoke.py` targets emulator5554 only (override `WHYLINT_EMULATOR` with another emulator serial), installs the fixture APK, resets that app on the emulator, and uses a synthetic account against local API3130. Never copy a production-targeting APK over the fixture filename. It verifies guest grading, themes/settings, signup, onboarding, session restoration across process restart, logout, password login and account-state clearing. Screenshots land in `qa/`. The script requires the parent repository's disposable stack to be running on3130; no real Google or Gemini call is part of this test.

`qa/safety_smoke.py` (same fixture APK and stack) covers the store-policy flows: legal links and support contact, reporting a comment, blocking and unblocking its author, and deleting the account. It has not been run yet because the emulator would not boot when it was written; run it before submission.

Google uses Android Credential Manager. Supply the public web/server OAuth client ID with `-PGOOGLE_SERVER_CLIENT_ID=...apps.googleusercontent.com` if it differs from the existing project. The backend's `GOOGLE_CLIENT_ID` must match. Register an Android OAuth client for package `app.whylint.nativeapp` and the actual signing certificate SHA-1 in the same Google project. Real Google consent cannot be verified without that console configuration and a device account.

Release builds require HTTPS and your own release signing configuration. Pass `-PWHYLINT_LEGAL_URL=https://…` and `-PWHYLINT_SUPPORT_CONTACT=…` to set the privacy/terms base URL and the support contact shown in the app (see `../README.md`); the Release contact is hidden until it is set. Debug APKs use a development signing key. Cleartext is permitted only for localhost and the Android emulator host alias in debug builds.

Coverage: feed and daily pool, personalized feed generation, all quiz formats, grading, explanations and follow-ups, comments/replies/helpful/delete, like/save/share, reports, public profiles, onboarding/preferences, signup/password/Google sign-in, profile progress/achievements/mastery, saved and practice lists, ranking, and community publication. Appearance is in Profile → Settings. Long content scrolls within a question so it remains readable; tablet layouts cap the reading width at760dp.

UI verification is recorded in `qa/VERIFICATION.md`. Physical-device accessibility, keyboard/IME variants, production Google consent, and store signing remain separate checks.

Locally exported artifacts (ignored by Git) are in `qa/builds/`: `whylint-local-debug.apk` targets the local3000 backend and is installed on the emulator; `whylint-cloud-debug.apk` targets Cloud Run; `whylint-cloud-release-unsigned.apk` is the optimized unsigned release; `whylint-fixture-debug.apk` targets disposable3130 only. The source uses the Cloud Run URL by default. `qa/builds/SHA256SUMS` identifies the exact exported files.
