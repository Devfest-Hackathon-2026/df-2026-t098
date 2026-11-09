# WhyLint for iOS

A standalone Swift 6 / SwiftUI app. It renders native views and calls the existing NestJS API with revocable Bearer sessions stored in the device-only Keychain. There is no web bundle or embedded browser rendering the UI.

Open `WhyLint.xcodeproj`, select the `WhyLint` scheme and an iPhone or iPad simulator. The included Xcode project can be built without XcodeGen. If you change `project.yml`, regenerate it with `xcodegen generate` (XcodeGen 2.46).

```sh
cd ~/code/hackathon/native/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project WhyLint.xcodeproj -scheme WhyLint -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build \
  CODE_SIGN_IDENTITY=- build
```

The default API is the existing WhyLint Cloud Run service. Native authentication requires the accompanying backend mobile-auth changes to be deployed. For development, override the URL at build time:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project WhyLint.xcodeproj -scheme WhyLint -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build \
  WHYLINT_API_URL=http://127.0.0.1:3000 CODE_SIGN_IDENTITY=- build
```

Debug launches can also use `SIMCTL_CHILD_WHYLINT_API_URL=http://127.0.0.1:3000 xcrun simctl launch booted app.whylint.native`. Release code accepts HTTPS only. Cookies and redirects are disabled for the API transport. Tokens are scoped to the API origin and never written to UserDefaults or logs.

`Config.xcconfig` supplies the public iOS OAuth client ID and its callback scheme for `app.whylint.native`. It also supplies the web client ID that matches the backend's `GOOGLE_CLIENT_ID`.

`Config.xcconfig` also holds `WHYLINT_LEGAL_URL` (base URL of the privacy policy and terms the app links to) and `WHYLINT_SUPPORT_CONTACT` (hidden in Release while empty; Debug shows a reserved example address so the UI tests can find it).

To use a different iOS OAuth client locally, run the setup script from `native/ios` and rebuild the app.

```sh
python3 scripts/configure-google.py YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
```

The script writes the client ID and matching callback scheme to `GoogleSignIn.local.xcconfig`.

No client secret belongs in the app. Without the iOS registration the Google action reports that sign-in is unavailable and directs the learner to email or username sign-in; password sign-in and guest learning remain available. Register a development team and use your own bundle identifier before device distribution; update the OAuth registration to match it.

## Verification

`WhyLintUITests` exercises rendered feed answering, authentication form validation, settings appearance selection, signup/onboarding, Keychain session restoration across termination/relaunch, and logout restoration. Run it against a disposable backend with isolated provider fixtures, not a production database. Its current fixture URL is `http://127.0.0.1:3130`.

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project WhyLint.xcodeproj -scheme WhyLint -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build -resultBundlePath build/UITests.xcresult \
  WHYLINT_API_URL=http://127.0.0.1:3130 CODE_SIGN_IDENTITY=- test
```

The source preserves the web palette, bundled DM Sans/DM Mono, five destinations, adaptive question cards with a readable scrolling fallback, code-line choices, explanations/tutor, comments/replies/helpful votes, publishing, account/settings, saved/practice collections and weekly ranking. Theme selection is exclusively in Profile → Settings. The app-wide reading preference sets a Dynamic Type floor while preserving larger system accessibility sizes. Native system sheets and device safe areas retain iOS behavior. Verification results and their limits are recorded in [the shared native audit](../UI-UX-AUDIT.md), rather than claiming pixel-for-pixel parity or treating source support as a completed device test.

Font licenses are bundled under `WhyLint/Resources`. The app icon and header artwork come from the web vectors. Run `node native/scripts/sync-brand.mjs` from the repository root to regenerate them.

Final local verification includes eleven native UI cases across the recorded suites, including legal links, account deletion and comment reporting/blocking (they need the disposable stack on 3130 and a shell without `HTTP_PROXY`/`HTTPS_PROXY`). The last focused reading-size check passes in `build/NativeReadingHandoff.xcresult`; it measures enlarged Profile text outside the lesson card. The final Simulator build targets `http://127.0.0.1:3000`, and the unsigned device Release build targets the existing HTTPS Cloud Run service. Screenshots and detailed scope are in `evidence/` and the shared audit.
