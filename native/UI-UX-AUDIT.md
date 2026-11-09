# WhyLint native UI/UX audit — 9 November 2026

The Android and iOS apps render native UI and share the existing backend. The reviewed phone screens preserve WhyLint’s palette, question-card hierarchy, five destinations, and account/settings structure. Theme selection is now in **Profile → Settings → Appearance** in the web app and both native apps.

**Audit disposition: the reviewed core native flows work, and the material defects found in this pass have been corrected and checked.** Final captures verify the shared hierarchy, palette, icons, settings, compact answer controls, and app-wide iOS reading-size behavior. Complete pixel-for-pixel equivalence is not established; remaining platform presentation differences and coverage limits are listed below.

## Evidence and method

- The visual reference is the current Angular source and the actual browser captures in [reference/](reference/README.md), including the measured [390px geometry](reference/web-geometry-390.json). Guest captures use public local data. Account captures use a unique synthetic learner in a disposable PostgreSQL stack.
- Android evidence comes from the running Kotlin/Compose app on an Android emulator, in [android/qa/](android/qa/). iOS evidence comes from the running SwiftUI app on an iPhone Simulator, in [ios/evidence/](ios/evidence/). These are actual native screenshots, not browser substitutes.
- Initial iOS captures showed a blank foreground/launch surface. They were rejected and replaced with settled app captures before this review. Initial Android captures were also replaced after the theme and layout corrections below.
- Source review covers API state ownership, form states, native controls, safe-area handling, text scaling, and the absence of header theme controls. Rendered inspection covers hierarchy, contrast, control labels, spacing, and visible overflow.
- Native UI verification includes Android UI smoke and eight unique passing iOS native UI cases across the suites, including targeted English/settings and publication verification, for the flows described below. The local integration run passed 25 direct API checks against the disposable backend, including grading, generated batches, assessment, follow-up questions, publication, and session revocation. API results alone do not prove the native UI for those operations.
- The final `NativeReadingHandoff.xcresult` passes the global text-size interaction (one test, zero failures): tapping Larger increases the actual Profile heading height by more than 10%, navigation stays reachable, and an explicit Standard test launch restores its prior size. The real Simulator capture is `ios/evidence/ios-settings-larger.png`. Earlier reading-test attempts had event-synthesis/virtualized-element selection failures; the bounded final test supersedes those attempts.
- The final-card case in `NativeFinalHandoff.xcresult` passes. Its refreshed same-question before/after captures show inline Read feedback, filled Next with a down arrow, a labeled follow-up action, and stable prompt/code geometry. That bundle also contains an earlier reading-selector failure, subsequently resolved by the separate passing `NativeReadingHandoff.xcresult`.

## Health score

Scores describe the reviewed implementation and its evidence, not a release certification. Physical assistive-technology behavior and frame times were not measured.

| Dimension | Android | iOS | Evidence and limit |
| --- | ---: | ---: | --- |
| Accessibility | 3/4 | 3/4 | Named actions, native fields and selection semantics; larger Android settings captured. VoiceOver/TalkBack traversal and maximum system text sizes remain unverified. |
| Performance | 3/4 | 3/4 | Native UI, asynchronous network transport, lazy/paged feed, bounded feed retention. No frame-time or low-memory profiling. |
| Appearance and theming | 3/4 | 3/4 | Shared tokens and bundled fonts; dark/light screenshots inspected; identified theme/branding defects corrected. Primary icons now come from the web SVG paths; some platform presentation and typography/spacing still differ. |
| Platform conformance | 3/4 | 3/4 | Native inputs, sheets/share actions, safe-area handling, system Back/dismissal paths. Physical gestures and external identity handoff remain separate checks. |
| Adaptivity | 3/4 | 3/4 | Android portrait, larger text and landscape code scrolling inspected; iPhone landscape and iPad portrait inspected. Current web and native layouts both permit inner scrolling at small heights. Split-window and full tablet/keyboard matrices remain open. |
| **Total** | **15/20** | **15/20** | **Good technical quality within the verified scope; exact parity remains open.** |

## Screen and flow coverage

| Screen or flow | Android evidence | iOS evidence | Result |
| --- | --- | --- | --- |
| Guest feed, prompt/code and action hierarchy | `android-final-feed-before-dark.png`, `android-feed-light.png` | `ios-final-feed-before.png`, `ios-feed-light.png` | Native rendering inspected in both appearances; same seeded question visible. |
| Quiz answer feedback | `android-final-feed-answered-dark.png`, `android-final-feedback-details-dark.png`, UI smoke | `ios-final-feed-answered.png`, `testGuestQuizAndLoginValidation` | Real API grading exercised; source preserves retry input and disables duplicate submission. |
| Appearance in settings | `android-settings-dark.png`, `android-settings-light.png` | `ios-settings-dark.png`, `ios-settings-light.png`, settings XCUITest | Header control removed; explicit choices and selected state verified. |
| Larger reading setting | `android-settings-larger-light.png` | `ios-settings-larger.png`, passing `testLargerTextAppliesAcrossSettings` | Android labels wrap. The iOS app preference enlarges general Profile text as well as lesson content, with reachable navigation and scrolling. |
| Login/signup and onboarding | Auth/onboarding screenshots and UI smoke | `ios-login-dark.png`, `ios-onboarding-dark.png`, signup/preferences XCUITest | Account creation and preferences connected to the real fixture backend. |
| Session restoration and logout | UI smoke, account and logout captures | `testSignupPreferencesSessionPersistenceAndLogout` | Native secure session restored after process relaunch; logout returns to guest state. |
| Signed-in profile and saved question | `android-profile-account-light.png` | `ios-profile-authenticated.png`, `ios-saved-question.png` | Synthetic account identity and a saved question are rendered. Full field-by-field progress/dashboard parity is not signed off. |
| Ranking | Source/API inspection | `ios-ranking-dark.png` | Actual fixture ranking is visible on iOS; creator navigation is implemented. |
| Publication | `android-final-publication-success-dark.png`, native form/advanced smoke | `ios-published-question.png`, native publication test | Both completed publication states were inspected and are backed by the real fixture backend. |
| Assessment and comments | `android-assessment-light.png`, `android-comments-light.png` | `ios-assessment-shared.png`, advanced journey test | Android shows a fixture assessment score and posted comment. iOS explanation editor and explicit publication action are visible with the keyboard open. Android QA also verifies a reply and another user’s Helpful vote. Exhaustive deletion/error-state coverage and every iOS social-write combination remain open. |
| Tutor, reports and creator pages | Tutor screenshot and UI check; reports/creator source/API inspection | Advanced journey and source/API inspection | Android tutor has actual native evidence. Exhaustive report/creator and every error-state interaction remain open. |
| Google identity | Credential Manager integration | GoogleSignIn SDK integration | Live consent and native client registrations remain external setup/verification. |
| Landscape/tablet | `android-feed-landscape-dark.png`, `android-feed-landscape-scrolled-dark.png` | `ios-final-feed-landscape.png`, `ios-ipad-feed-dark.png`, landscape XCUITest | Actions remain visible on landscape phones; Android remaining code rows are shown after scrolling. iPad portrait is readable. Current web also scrolls at its reading floor; scrolling alone is not a mismatch. |

## Visual hierarchy and style

The full-height question card, complete prompt, code/choices, social row, and explanation/details actions are present in both native phone captures. Main destinations retain the web order. Account information and display settings are distinct sections. Settings no longer compete with the primary learning action in the top bar.

The native implementations use the web’s dark canvas `#080808`, surface `#151515`, text `#f5f5f2`, and accent `#c6f24e`, with explicit light counterparts. DM Sans and DM Mono are bundled with licenses. Japanese text retains the platform fallback font. iOS’s initially incorrect font name was corrected to the actual bundled PostScript name, `DMSans-9ptRegular`.

Static token contrast checks passed for the inspected foreground/background pairs: dark body 18.34:1, dark muted text on a surface 8.75:1, light body 14.21:1, light muted text on white 6.75:1, and light accent on white 6.09:1. This is token verification, not a claim that every possible overlay, placeholder, image, or state was measured.

## Accessibility, navigation, and forms

- Native controls have visible labels or named icon actions; selected tab and appearance states are represented semantically.
- Form labels are separate from user input. Password input is secure, requests show pending states, and errors preserve editable input.
- The phone screenshots keep content clear of the status bar and bottom system area. Android’s light appearance now changes system-bar icon contrast with the app theme.
- Theme and reading preferences persist on the device. Guests can reach the settings section through Profile.
- iOS uses native sheets/navigation; Android preserves system Back. Native sharing uses the operating-system share surface.
- The review did not exercise VoiceOver/TalkBack end to end, external hardware keyboards, all keyboard/IME variants, maximum accessibility sizes, or physical swipe behavior. Native semantics in source are not equivalent to completed assistive-technology testing.

## Findings corrected during the pass

| Finding | Impact | Resolution and verification |
| --- | --- | --- |
| Header theme controls competed with learning/navigation | Appearance was scattered across routes | Removed from web home/auth/onboarding headers; explicit persisted settings added. 226 web tests and production build passed; isolated browser interaction verified persistence. |
| Android selected chips inherited purple Material defaults | Brand/theme mismatch | Explicit color roles added; later onboarding/settings captures inspected. |
| Android light theme left white system-bar icons | Time and status icons lost contrast | System-bar appearance now follows selected app theme; corrected light screenshots inspected. |
| Native settings used wide CTAs/chips and omitted helper text | Material mismatch with the requested web layout | Compact guest CTA, appearance helper and radio-like choices added. Corrected settings screenshots inspected. |
| Auth layout and action order diverged | Login and account creation were less consistent | External labels, brand styling, primary action and alternate sign-in order aligned in the correction pass. |
| Navigation/social icon shapes differed | Web brand consistency | The same web SVG paths now generate Android vector drawables and iOS template assets; the current Android and iOS final feed pairs show the corrected icons. |
| iOS requested a font name absent from the bundled font | Silent system-font fallback | Font metadata checked; correct PostScript name now used in source and the later native captures. |
| Feed/account requests could outlive the state that started them | Stale account/language data could replace current state | Platform owners added feed generations, token ownership checks and private-state invalidation. Source reviewed; account smoke verifies the normal transition paths. |
| Android generated only the first personalized batch | The personalized feed stopped replenishing | Generation is rearmed for subsequent thresholds; source corrected. Repeated long-session behavior is not exhaustively stress-tested here. |
| iOS app reading preference initially applied only to questions | Settings/comments/auth text did not follow the app preference | A global Dynamic Type floor now follows Standard/Large/Larger while preserving larger OS sizes. The final focused UI test confirms actual Profile text growth and Standard restoration; the Larger capture was inspected. |
| Web guest CTA contrast and narrow settings choices | Low-contrast CTA and cramped labels | Semantic button text color and whole-label wrapping applied; 320px/Larger browser capture inspected. |

## Open findings and acceptance limits

### Adaptive sizing and answered-state correction

The initial fixed-size native question area and expanded inline explanation differed from the web. Both platform implementations now use bounded fitting with 13-point prompt/choice and 11-point code floors, an empty 56-point outcome reservation before answering, and compact outcome/Read-feedback/Next controls afterward. Native horizontal code scrolling and the readable vertical fallback remain available. The final same-question before/after pairs on both platforms were independently inspected: prompt/code geometry remains stable, the reserved area receives compact feedback, and the social footer stays in place. Android Read feedback opens the explanation in a native sheet; Next advances the feed. Both final pairs show the web-derived primary icons. This closes the initial material sizing/outcome finding for the captured fixture.

The current web code itself uses a measured density range of 0.72–1.2 and enables inner scrolling at its reading floor. Direct measurements of the same Node question at 914×411 confirm a 237px region with 302px scroll height; 874×402 also scrolls. Thus inner scrolling alone is not a parity failure. Measurements and current answered-state references are retained in `reference/web-current-*.json` and PNGs. Native fitting uses platform layout rather than the identical web measurement algorithm, so exhaustive sizing equality has not been established.

**[P2] Other visual differences and incomplete parity coverage.** The core phone hierarchy and palette match, but iOS modal auth/onboarding chrome, font rendering, line wrapping, and some control spacing differ. The earlier outcome-row differences are corrected in source and the refreshed same-question captures: Read feedback is inline, Next uses a filled capsule with a down arrow, and the follow-up action has its text label. Primary navigation and social icons use the web SVG paths and are present in the native captures. The screenshot matrix does not cover every authenticated, error, loading, English, and dense-content state. Compare each remaining state against the same web fixture before calling the UI “exactly the same.” Observed platform presentation differences remain distinct from states that have not been reviewed.

**[P2] Broader adaptivity and accessibility need direct validation.** The captured Android landscape and iPad portrait samples do not establish every landscape/tablet layout, split-window mode, maximum text-size or screen-reader behavior. Record and fix any unreachable actions on those configurations before claiming complete device accessibility.

**[P2] Advanced native journeys have less interaction coverage than the API.** Android assessment/comment posting/tutor and iOS assessment/explanation sharing, saved collection and completed question publication have native UI evidence. Reporting, every creator/navigation path, every reply/helpful/delete outcome and repeated long-session feed generation were not exhaustively exercised on both platforms. The API checks cover more combinations than the native screenshot matrix. Network interruption, app backgrounding during writes and account changes during pending work deserve a focused follow-up.

## Release prerequisites

The mobile-auth backend routes must be deployed before native sign-in works on the public Cloud Run service. Native Google client/package/callback registrations, real provider consent, Apple device signing and Android release signing require the owner’s project configuration. Emulator/simulator tests used isolated identities and provider fixtures. Local debug connectivity and fixture verification are not production deployment evidence.

## Recommended next checks

1. Finish the remaining device matrix with `$impeccable adapt`, including broader landscape, Android tablet, split-window, keyboard-open states and maximum accessibility text.
2. Use `$impeccable harden` for the advanced native write/retry/background/account-change journeys.
3. Repeat `$impeccable audit` with VoiceOver/TalkBack and the complete screenshot matrix.
4. Run `$impeccable polish` on the remaining measured visual differences.
