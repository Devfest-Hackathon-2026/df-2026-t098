# WhyLint Android verification — 9 November 2026

The Kotlin app was compiled and run on the owned `whylint_api37` AVD (`emulator-5554`, Android API37, 1080×2400, density420). It uses actual native Compose widgets and the existing NestJS/PostgreSQL API. Google and Gemini were isolated by the parent repository's disposable backend on host3130. No personal account was used.

## Build results

- `assembleDebug -PWHYLINT_API_URL=http://10.0.2.2:3130`: passed.
- `lintDebug` on the fixture build: passed with zero errors. Remaining warnings are pinned dependency update notices and preferences/KTX suggestions.
- Default HTTPS `assembleDebug` and optimized `assembleRelease`: passed. Release is unsigned and requires owner signing before distribution.
- `assembleDebug -PWHYLINT_API_URL=http://10.0.2.2:3000`: passed for the existing local development backend.

## Native runtime checks

`ui_smoke.py` passed on the fixture APK:

1. Fresh app launch, onboarding skip, real guest feed load and correct quiz grading.
2. Appearance controls exist only in Profile → Settings; switching dark/light updates app and system bars, and Larger text wraps controls without clipping.
3. Real signup creates a session, two-step onboarding saves interests/preferences, and the personalized feed loads.
4. The session survives process termination/relaunch through origin-scoped Android Keystore storage.
5. Confirmed logout removes account UI; password login restores the same synthetic account; a second logout clears it again.

Additional actual native checks passed:

- App background/foreground revalidates the session.
- A written explanation receives a fixture assessment through the real grading API (`android-assessment-light.png`).
- A native comment is persisted and displayed (`android-comments-light.png`).
- The native tutor returns the fixture follow-up answer (`android-tutor-light.png`).
- A guest launch against the real local backend3000 loads the feed with no fixture identity. Origin-specific token storage prevented crossing test and development servers.
- Phone landscape retains reachable social actions and navigation. Code remains readable by scrolling when the viewport is shorter than the content; before/after-scroll captures are included.

Advanced native bindings were exercised and passed with disposable accounts:

- Helpful changed the expected server-side vote; self-votes are disabled.
- A native reply was persisted with a parent comment.
- Saving a question made it appear in Profile's saved-question list.
- Community publication passed the fixture moderation API and displayed the published question. The final form was aligned to the current web template and retested independently.

`advanced_smoke.py` preserves the flow. UIAutomator exports Compose field labels and selected semantics on separate nodes, so the adapter targets semantic field bounds and verifies the Helpful vote delta against the same disposable API. An expanded modal can consume Back to collapse first; `close_sheet()` handles that before navigating.

## Visual audit and fixes

Reference screenshots are in `native/reference/` in the repository. The native/reference web captures remain the authority for hierarchy, palette, copy and type. Audit fixes included:

- Bundled DM Sans / DM Mono, exact dark/light palette, white underscore and lime wordmark dot.
- Replaced Material navigation/social glyphs with generated vectors from the existing web icon paths.
- Removed all topbar theme controls; matched Profile appearance and text-size radio cards, helper text and compact guest sign-in button.
- Corrected light-theme status-bar contrast and default Material purple selected controls.
- Matched authentication header, labels, action order, lime primary button and Google's official G asset.
- Kept 48dp answer and social touch targets; compact passive code lines; use bounded adaptive prompt/code sizing down to13/11sp with readable scroll fallback.
- Reserve the56dp feedback space before and after grading. Feedback details open from Read feedback; Next advances the feed without replacing the full question.
- Larger text and landscape checks retain visible controls and scroll access.
- Final before/answered/feedback/Next captures are named `android-final-feed-before-dark.png`, `android-final-feed-answered-dark.png`, `android-final-feedback-details-dark.png`, and `android-final-next-dark.png`. Read feedback and Next were exercised on the actual app.
- English settings/feed rendering and language persistence across process restart passed; Japanese was restored. See `android-settings-english-dark.png` and `android-feed-english-dark.png`.
- Added semantic labels to form fields and Helpful; disabled self-votes; kept private answers private unless the learner explicitly publishes them.
- Bound session storage to API origin, disabled backup/device transfer, discarded invalidated private state, guarded stale feed responses and kept mutation retry IDs stable.

## Limits

This is a runtime and visual audit on one Android emulator, with light/dark, larger text, keyboard and landscape samples. It does not establish pixel equality on every screen size, physical-device TalkBack/IME behavior, real Google consent, real Gemini quality, or store readiness. Tablet reading width is capped at760dp; tablet navigation and foldables need device review. Native font rasterization and touch hit areas can differ from a browser capture.

The default Cloud Run APK needs the new mobile auth endpoints deployed. Google sign-in needs an Android OAuth client registered for this package and signing certificate in the same project as the configured web/server client ID. The local3000 APK is the currently installed development build.

## Handoff after the interrupted session

The verified local APK remains in `qa/builds/whylint-local-debug.apk`. The emulator process stopped during the interruption. Attempts to reopen the existing AVD afterward stalled in QEMU boot, before the app launched; the stalled attempt was stopped. Earlier native flow and screenshot results above remain the validation evidence. The final APK is ready to install from Android Studio/ADB when the emulator or a device is available. No emulator data was wiped.
