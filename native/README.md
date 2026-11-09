# WhyLint native apps

Two independent native projects share the existing WhyLint API:

| Project | UI and language | Open in |
| --- | --- | --- |
| `android/` | Kotlin and Jetpack Compose | Android Studio |
| `ios/` | Swift and SwiftUI | Xcode (`WhyLint.xcodeproj`) |

The current Angular app is the visual reference. DM Sans and DM Mono, the lime
accent, dark/light palettes, lesson cards, and five main destinations carry into
the native implementations. Appearance is in **Profile → Settings** on all three
clients. Reference screenshots and their verification scope are in `reference/`.
Primary navigation and social icons use the web's actual vector paths. Run
`python3 native/scripts/sync-web-icons.py` from the repository root after changing
the shared web icon source to regenerate the Android drawables and iOS image sets.

For normal local development, run the existing backend with `npm run start:dev`
from `backend/`. Android's emulator reaches it at `http://10.0.2.2:3000`; the iOS
Simulator uses `http://127.0.0.1:3000`. The final installed development builds use
these addresses. Test accounts and provider fixtures use the separate port 3130.

## Android

Use JDK 21 and Android SDK 36. From the repository root on this Mac:

```sh
cd native/android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./gradlew assembleDebug
```

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. The default origin
is the existing Cloud Run API. To build against the disposable API on the host:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./gradlew assembleDebug -PWHYLINT_API_URL=http://10.0.2.2:3130
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Local HTTP is permitted only in the debug configuration. Release builds require
HTTPS. Production distribution needs an owner-managed signing key and the Android
OAuth registration for the package and signing certificate.

## iOS

Open `native/ios/WhyLint.xcodeproj`, choose the WhyLint scheme, and run on an iPhone
Simulator. The checked-in project can build without a project generator:

```sh
cd native/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project WhyLint.xcodeproj -scheme WhyLint \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGN_IDENTITY=- build
```

The app is `build/Build/Products/Debug-iphonesimulator/WhyLint.app`. A local debug
build can set `WHYLINT_API_URL=http://127.0.0.1:3130`. Real devices require the
owner's Apple team/signing configuration; Simulator artifacts are not App Store
or physical-device packages.

## API and identity setup

See [API.md](API.md) for endpoint contracts, session handling, and the disposable
integration stack. The new backend routes must be deployed before native sign-in
works on the production API. Existing accounts and learning data are reused; no
database migration is required.

Google identity uses Android Credential Manager and the Google Sign-In iOS SDK.
The Android package/signing certificate and iOS bundle/client ID must be registered
in the existing Google project. The backend verifies the ID token against its
configured server audience. Native apps must never contain the Google client
secret or backend signing secret.

The iOS build settings are `WHYLINT_GOOGLE_IOS_CLIENT_ID`,
`WHYLINT_GOOGLE_REVERSED_CLIENT_ID` (the registered callback scheme), and
`WHYLINT_GOOGLE_SERVER_CLIENT_ID` (matching the backend's `GOOGLE_CLIENT_ID`).
The app reports missing identity configuration instead of attempting an invalid
Google sign-in.

## Store requirements: legal links and support contact

The privacy policy and terms are published by the owner; the apps carry no policy text. Each app
links to `<base>/privacy` and `<base>/terms` on the sign-in screen and in Profile, and shows the
support contact in Profile, driven by one build setting each:

| Setting | iOS (`ios/Config.xcconfig`) | Android (`-P` Gradle property) | Default |
| --- | --- | --- | --- |
| Legal base URL (HTTPS) | `WHYLINT_LEGAL_URL` | `WHYLINT_LEGAL_URL` | the Cloud Run origin |
| Support contact | `WHYLINT_SUPPORT_CONTACT` | `WHYLINT_SUPPORT_CONTACT` | empty in Release (hidden); `support@example.test` in Debug |

The web app reads the same two values from the backend's `LEGAL_BASE_URL` and `SUPPORT_CONTACT`
environment variables (`GET /api/v1/config`). Before submission: publish the documents at the base
URL, set the real support contact for Release builds, and fill the App Store privacy labels and the
Play Data safety form from the real data flows.

## Verification

`node native/scripts/verify-api.mjs` verifies direct native API requests against a
dedicated local fixture service, including authentication, learning writes and
revocation. It refuses the normal development ports and nonlocal hosts.

The native UI audit is recorded in `UI-UX-AUDIT.md`; read its per-platform evidence
and open findings before treating visual parity or device accessibility as signed
off. Build outputs are local and ignored by Git; native captures live in each
platform's `qa/` directory. Store packaging, real Google consent, physical-device gestures and assistive
technology checks are separate from simulator/emulator validation.
