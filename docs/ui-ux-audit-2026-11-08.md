# WhyLint UI/UX audit — 2026-11-08

## Status and scope

The baseline audit inspected the shared checkout before changes. The user then explicitly authorized creating fix/mobile-feed-scroll, where the implementation below was completed. The existing personal Xcode signing setting was preserved.

The existing mobile audit did not establish the requested short-swipe behavior. Its checks covered a compact SQL card before answering, while current phone CSS uses proximity snapping and unconstrained card height. The new audit separates source findings, rendered reproductions, and physical-device verification.

### Evidence environment

- Angular frontend on localhost:4300, actual NestJS API on3102, disposable PostgreSQL, Google and Gemini isolated by the test harness.
- Playwright MCP exploration in its own isolated browser context. Only synthetic fixture accounts were created.
- Rendered sizes included320×568,390×844,390×300, and1440×900. The300px height is a short-viewport stress test, rather than evidence from a physical keyboard.
- Both languages and themes were inspected through source. Rendered checks included Japanese/light and English/light/dark, plus the app's Larger reading size20.8px root font.
- All app routes and the five homepage tabs were inspected from source. The matrix below distinguishes rendered coverage.
- Source detector completed with0 primary findings and4 spring-easing advisories under the existing project configuration. Three exact-file dynamic-avatar false-positive exceptions are already configured. The detector does not validate feed paging, draft persistence, or error recovery.

## Priority findings

### P1-01 — Mobile scrolling has no one-question paging contract

Evidence: homepage.css phone override changes scroll-snap-type from mandatory to proximity and scroll-snap-stop from always to normal. homepage.ts derives the active item from ordinary scroll position and has no short-swipe threshold, cancellation handling, or one-item cap.

Impact: short gestures can scroll inside a question or stop between lessons. This conflicts with the requested TikTok interaction.

Fix: controlled vertical paging in the compact Feed viewport. A completed short vertical swipe should advance exactly one question. Reverse swipes return one. Keep horizontal code pans, pinch zoom, inputs, and modal scroll independent. Suppress an answer click after a consumed swipe. Preserve immediate keyboard navigation and reduced-motion behavior.

### P1-02 — Cards grow beyond the phone viewport

Evidence: .feed-slide has min-height:100% but no exact height. On320×568 the main feed viewport measured423px, while sampled slides measured625,739,614,886, and777px. At390×844 a sampled slide still measured858px against699px of feed height. Full feedback, error recovery, and the first-slide hint can add more height after an answer.

Fix: every compact slide must have exactly the available feed height. Reserve predictable action rows and keep readable text and48px controls. Put secondary detail and long feedback in the existing sheet. For unusually long questions, offer an explicit full-question sheet containing the complete prompt, code, and answer controls. Existing Details currently omits the code and options, so clipping the card would lose required information.

Content limits matter: the179-question seed pool includes349-character prompts,17-line code, and94-character choices. Fitting all of that at320×568 requires a full-content presentation beyond the preview. Font shrinking alone is insufficient.

### P1-03 — Saved feed position can be replaced by another tab's position

Evidence: Homepage's destruction handler always writes the current main scroller offset into feed.scrollTop, including when Profile, Practice, or Post is active. Opening a saved lesson from a scrolled secondary page can therefore restore Feed to the wrong position on return.

Fix: record Feed position only while Feed is active. Restore by stable active item and realign after resizing. Preserve the originating tab and position for secondary-route returns.

### P1-04 — Shared lesson becomes a dead end after session restoration failure

Evidence: shared-question.ts stops its effect for session unavailable. The template has no matching recovery state. With /auth/me isolated to return503, the rendered page contained only Back to the feed.

Fix: show a scoped session error and Retry, or allow the public lesson fetch to proceed independently of account restoration.

### P1-05 — Post draft disappears when switching tabs

Evidence: PublishQuestion stores composition in component signals. Conditional homepage rendering destroys it on tab changes. Browser reproduction entered a title, switched to Profile, then returned to Post. The title was empty.

Fix: preserve a per-account draft across tab navigation or retain the mounted editor. Provide explicit discard semantics. Protect pending review/publication requests and account changes.

### P1-06 — Onboarding step transition loses its focus and scroll destination

Evidence: Continue and Back call step.set directly. Browser reproduction entered step2 with BODY focused and an existing document offset. The new heading was not focused.

Fix: one step-transition operation should render the new step, reset its owned scroll position, and focus its heading. Use immediate structural movement.

### P1-07 — Comments composer can be clipped in a short viewport

Evidence: the fixed78dvh sheet has hidden overflow and auto-sized header/composer rows. At390×300 with Larger text, the sheet measured234px, scrollHeight258px, and the textarea/send control extended to308px while the viewport ended at300px.

Fix: use the available visual viewport, reserve reachable composer space, and let the sheet body shrink or scroll. Verify again with the actual iPhone keyboard, safe areas, and landscape.

## P2 findings

1. Theme state diverges after authentication-page navigation. Login/Signup mutate the root and storage through independent signals. DisplaySettings remains alive with its old theme. Browser reproduction toggled Login to dark, returned through the brand link, and found a dark page whose header button still said Switch to dark theme. Use the shared settings state.
2. The app's Larger setting is inconsistent across screens. Many auth, onboarding, ranking, creator, and publication labels use fixed px. Their text does not follow the root reading scale. Convert user-readable text to rem and retain at least16px/1rem inputs.
3. A valid60-character unbroken custom technology can exceed the onboarding chip width. Bound selected/catalog chips and wrap their content. Verify the full remove affordance remains visible.
4. Onboarding controls stay editable while a saved snapshot is pending. The UI can show choices that differ from the data being saved. Disable the preference group during save and retain error recovery.
5. Initial Saved-request failure appears as an empty collection. Profile uses a shared generic error and leaves saved empty. Put a Saved-specific error/retry in that section and distinguish unknown from empty.
6. Publication validation appears at the bottom without consistent field association or focus recovery. Associate each error and focus the first invalid field or option group after revealing collapsed sections.
7. Comment Delete is immediate and has no confirmation or undo. Provide deliberate recovery before permanently removing a contribution.
8. The guest Profile CTA says Sign in with Google while opening a general sign-in page. The label is especially misleading on Android, where native Google remains unavailable. Use Sign in.
9. Native Google pending state has no bounded recovery if the plugin does not settle. The auth screen replaces its controls with a skeleton. Add a recovery path and ignore stale completions after cancellation. This is a source risk, not a reproduced physical-device hang.
10. Native Google availability copy uses coming soon for both unsupported Android and missing iOS configuration. Distinguish those states with product-facing recovery copy.
11. Raw-pixel feed restoration becomes stale after rotation, reading-size changes, and HUD wrapping. Restore the active item and align it when the feed viewport changes.
12. Creator contributions expose complete shared explanations immediately while discussion uses spoiler protection. Treat this as a product consistency choice. An explicit reveal affordance can preserve the learning loop.

## P3 observations

- Auth/onboarding commonly use44px targets, while the rest of the app targets48px. Standardize the mobile target floor.44px alone is not a WCAG AA failure.
- Some celebration motions use spring easing. The detector reported four advisories. These are lower priority than reading and paging.
- Fonts depend on a runtime Google Fonts request. The local test browser reported external-font loading errors. Bundle fonts if predictable offline native typography is required.

## Coverage matrix

| Interface | Source review | Rendered checks | Further verification |
|---|---|---|---|
| Feed | Layout, gestures, active item, prefetch, pruning, all question types | Guest/auth; daily, code, choices, JA/EN;320×568 and390×844; Larger | Implement short-swipe tests and actual iPhone gestures |
| Question feedback | Pending, retry, answer reveal, assessment, Next | Existing states inspected; unconstrained reveal identified | All types after answer and network failure |
| Details/explanation/tutor | Dialog ownership, full-content availability, focus/close/retry | Layout inspected from source | Keyboard, long feedback, scroll retention on phone |
| Comments | Guest/auth, reply, Helpful, delete, spoiler, loading/error | Authenticated sheet; short viewport composer clipping | Actual iPhone IME and VoiceOver |
| Practice | Guest/auth, empty/loading/error/populated | Authenticated empty at320 and1440 | Populated return navigation and request failure |
| Ranking | Weekly/daily, loading/error/empty, long values | Authenticated320 and1440; no horizontal overflow | Extreme names/counts and full large-text pass |
| Post | Guest, draft, validation, pending/error/published | Authenticated320 and1440; draft loss reproduced | Full invalid-form focus and publication recovery |
| Profile/settings | Account, avatar, username, language, text, logout, progress, saved | Auth/guest, English/Japanese settings, Larger;320 and1440 | Saved failure, populated progress and physical controls |
| Creator profile | Public identity, empty/populated, errors | Public fixture creator at390; no horizontal overflow | Long contributions and error injection |
| Shared question | Guest/auth/loading/error/unavailable | Normal public lesson;503 session dead end | Normal detail and question-aware auth return on device |
| Login | Labels, validation, callback, native states | English layout and theme round-trip reproduced | Native SDK interruptions and password manager |
| Signup | Labels, validation, pending/error | Fixture signup; empty submit focuses email;390 layout | Native keyboard and long errors |
| Optional username | Validation/conflict/pending/recovery | Source | Real keyboard and completion focus |
| Onboarding | Both steps, catalog, custom input, save/edit/skip | Japanese two-step transition and skip |60-character custom chip and slow save |
| Native shell | Safe areas, status bar, Back, keyboard, share | Source reviewed | Actual iPhone swipe, pinch, IME, VoiceOver; Android TalkBack |

## Verification required for the fix

-32–48px vertical swipes page exactly one item in each direction. Long flings do not skip multiple lessons.
- Tapping an answer submits once. Swiping over that answer does not submit it.
- Horizontal code movement, pinch zoom, cancelled gestures, and gestures inside an open sheet do not page Feed.
- All primary cards fit the measured compact feed viewport before answer, after answer, and during error recovery.
- Long prompt/code/options have a complete reachable presentation with accessible answer controls.
- Rotation and reading-size changes retain the same active question.
- Prefetch and pruning preserve item identity and answer state.
- Keep focused desktop content and right-side comments, then verify phone bottom sheets separately.

## Limits

This audit does not claim exhaustive device verification. Physical iPhone gestures, actual IME resizing, VoiceOver/TalkBack order, hardware haptics/share feel, and all OS versions remain unverified. Source-backed risks and rendered failures are labeled separately. The remediation was implemented on fix/mobile-feed-scroll after the baseline audit.


## Remediation and verification — 2026-11-09

### Fixed findings

- P1-01 and P1-02. Compact Feed uses exact viewport-height slides, a40px-tested short-swipe interaction with a32px distance threshold, and a one-item limit. Finger movement tracks the page, while cancellation, horizontal intent, pinch permission, modal ownership, and click suppression keep other tasks usable. Nested code scroll containers have explicit horizontal-pan/pinch behavior.
- The user rejected the required full-question sheet. Prompt, code, and all choices now stay inline. A bounded measured fitter chooses the largest typography/spacing combination that fits the stage, with compact choice columns in portrait and landscape. No preview, inert stage, question line clamp, or required Open full question action remains.
- Answered compact cards retain the question, code, and choices with correct/wrong styling. A compact outcome/Next/Read feedback bar provides feedback access while the card retains its viewport height.
- P1-03. A secondary tab no longer overwrites the saved Feed offset. Pending scroll frames are cancelled on tab switches. Resizing/pruning clears stale paging state and realigns the active item. Returning to a secondary tab itself after a separate route remains a possible navigation enhancement.
- P1-04. Shared lessons expose account-restoration failure and Retry. Browser verification exercised503 followed by successful recovery.
- P1-05. An account-owned in-memory publication draft survives tab teardown, including request identity for retries. Its lifetime is the current open app session, and the form explains this.
- P1-06. Both onboarding step transitions restore heading focus and the document top position.
- P1-07. Short-viewport comments use the available height and a scrollable composer. A browser test verifies the Send control can be reached at390×300. Actual IME testing remains a device check.
- Theme updates use the shared DisplaySettings service and follow OS appearance until the user makes a choice. Auth/onboarding/ranking/creator/publication reading text now follows the root scale.
- Long technology chips wrap. Preferences are locked while their save snapshot is pending.
- Saved questions have their own loading/error/retry state. Publication validation focuses the relevant field. The correct-answer radio has a48px label target. Guest Profile uses a general Sign in label.
- Native Google availability copy names the unavailable state with password recovery.

### Remaining findings

- Native Google SDK/callback indefinite-pending recovery needs a separate cancellation and stale-completion design.
- Comment deletion confirmation/undo remains a follow-up.
- Creator-profile spoiler presentation remains a product decision.
- A few optional username helper styles still use fixed pixel sizing.
- Fonts still rely on a runtime Google Fonts request.
- Physical iPhone swipe feel, Safari/WKWebView touch arbitration, actual keyboard resizing, VoiceOver/TalkBack, and hardware haptics/share remain device checks.

### Checks completed

-288 frontend unit tests passed across28 suites.
- Frontend application/spec TypeScript checks passed. Production web build passed.
-56 browser tests passed across mobile and desktop against real NestJS and disposable PostgreSQL, with external providers isolated. Two mobile-only paging cases were skipped in the desktop project by design.
-10 Google OAuth browser-fixture cases requiring port4200 were excluded from this4300 run because the normal dev frontend owns4200. These counts do not establish a real Google OAuth/device flow.
- Additional paging regressions cover short/reverse/long/cancelled/horizontal swipes, no answer submission during swiping, normal answer taps, rotation, full content access, and inert keyboard controls.
- The revised sizing regression checks six actual public seed questions across320×568,390×844, and844×390, plus a Larger-text case. It asserts complete inline prompts, code lines, and every choice within the stage. Horizontal code panning remains available.
- Signed iOS Simulator and Android debug compilation passed. These compile checks do not establish physical gesture feel.

### Visual evidence

Local review captures are stored under frontend/.impeccable/review/mobile-paging-2026-11-09. They include the390px stage before and after answer,320px overflow preview, the complete question sheet,320px Larger preview, and the focused desktop feed with right-side comments and dark appearance.


## User correction — inline question and choices

The final implementation follows the user's explicit correction to keep the question and all choices visible. The earlier full-question preview proposal above is superseded. Optional detailed feedback still has a sheet, while solving a question happens directly on the feed card.

The fitter changes actual font sizes and spacing, without transform scaling. It searches for the largest measured fitting size and rechecks after viewport, content, root text-size, and late web-font changes. Short cards keep their normal typography. Dense code questions can use compact choice columns.

Readability remains an explicit tradeoff for extreme content on very small viewports. In the17-line advanced Kubernetes example at320×568, measured text reached approximately8.4px prompt,8px choices, and6.5px code. At390×844 the same example used approximately16px prompt and12.4px code/options. These tiny-screen values fall below normal reading-size guidance. The implementation satisfies the requested one-screen inline presentation, and this audit does not label those exceptional sizes as resolved accessibility/readability.

Ordinary choice targets are44px minimum; answerable code rows can reduce to32px. The Larger preference is a starting size and can be reduced by fitting when content exceeds the screen. These constraints should remain visible during device review.

Current inline review captures are under frontend/.impeccable/review/inline-question-fit-2026-11-09.

The corrected inline layout passed all288 frontend unit tests,56 isolated browser tests, frontend/e2e TypeScript checks, the production native bundle build, and refreshed signed iOS Simulator and Android debug builds. Ten port4200 Google browser fixtures were excluded and two mobile-only cases skipped on desktop.
