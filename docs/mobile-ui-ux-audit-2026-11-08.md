# WhyLint mobile UI/UX audit

Reviewed on 8 November 2026 in `feat/core-learning-feed`.

This document retains the original audit as a historical baseline. The resolution
update below records the implementation and root-verified results from the fix
pass. The provisional 12/20 score describes the pre-fix state.

## Scope and evidence

This is an audit and implementation plan. Application source was inspected without
editing it. The review covers the supplied native iPhone screenshot, current
Angular/Capacitor source, the installed iOS app bundle, and controlled rendering of
the native bundle in a browser stand-in.

- The iPhone 16 Pro Max Simulator is booted. The available UI automation surface
  could not bind the Simulator, so this pass uses the user's native screenshot
  and read-only installed-bundle inspection for native evidence.
- Browser measurements used a disposable PostgreSQL/backend stack on 3102, native
  stand-in on 4401, and web preview on 4300. Google/Gemini were isolated. The
  SQL question came from the actual seeded test API. A controlled 503 reproduced
  the answer-error state. A synthetic progress response exercised the HUD.
- The shared layout was checked at 320x740, 390x844, 430x932, and 844x390. Profile,
  publishing, ranking, and comments were sampled at phone width. Japanese/dark
  and English/light profile states were checked.
- Browser captures are under
  `frontend/.impeccable/review/mobile-ux-2026-11-08/` and are labeled browser evidence.
- VoiceOver/TalkBack, native Dynamic Type, actual keyboard geometry, native
  landscape cutouts, physical touch feel, and frame performance need device or
  Simulator interaction in a follow-up pass.

## Baseline assessment

The central problem is the mobile task structure. A card stacks several stages
of learning and supporting information inside a full-height snapping feed.
Users need a compact question/answer stage, clear submission recovery, and
explicit access to deeper explanation and reference material.

The current native installation also targets a stopped disposable backend. That
operational problem accounts for a failed submission on the audit's current
setup and must be handled separately from the layout work.

### Baseline platform conformance verdict

Needs work before mobile UI sign-off. The shell supplies native integrations,
while the learning surface needs larger targets, text enlargement, safe insets,
and a clearer separation of task stages.

### Historical provisional implementation score

These scores combine source review, the supplied native screenshot, and the
controlled shared-layout measurements. They are an implementation assessment.
Native runtime accessibility and performance still require direct verification.

| Dimension | Score | Main evidence |
| --- | ---: | --- |
| Accessibility | 2/4 | Small targets, fixed small type, absent app-level native text enlargement |
| Performance | 3/4 | Lazy routes, bounded feed, frame-scheduled scrolling. Device frame times unmeasured |
| Appearance and theming | 3/4 | Strong core contrast and coherent tokens, with a failing hot-combo palette |
| Platform conformance | 2/4 | Native inset and target-size gaps in the shared UI |
| Adaptivity | 2/4 | Card height exceeds the learning area, especially in landscape |
| Total | 12/20 | Significant mobile UX work before release polish |

There are 10 findings, comprising one P0 operational blocker, three P1 issues,
and six P2 issues. Runtime-only uncertainties are identified in each finding.

## Original findings

### A01 — P0 — Installed app targets an unavailable backend

Read-only inspection of the installed app's `nativeApiBaseUrl()` found
`http://localhost:3101`. No backend was listening on 3101 when the audit began.
The normal backend listens on 3000. Its responses currently omit matching CORS
allowance for both `capacitor://localhost` and `https://localhost`.

The app can display content retained in its current process while a subsequent
answer request fails. The exact HTTP failure in the historical screenshot was
not captured, but this audit confirmed an unreachable target in the installed app.

Rebuild the local native bundle against the intended dev API and configure the
two native origins for that backend. Recheck a signed native build through cold
start, answer submission, restart, and API outage/recovery. Existing signed-build
and secure-storage requirements still apply.

[Native build configuration](/Users/kenzietann/code/hackathon/frontend/scripts/native-build.mjs), [runtime API adapter](/Users/kenzietann/code/hackathon/frontend/src/app/native/platform.ts), and [allowed origins](/Users/kenzietann/code/hackathon/backend/src/auth/allowed-origins.ts).

### A02 — P1 — The card contains too many interaction stages

The first card renders the prompt, restated title, attribution, difficulty,
topics, code/choices, error or feedback, social actions, deeper-learning tools,
references, and reporting inline. At the same time, the feed uses mandatory
vertical snapping and a full-viewport minimum slide height.

Measured failed-answer card geometry in the controlled native-bundle stand-in:

| Viewport | Learning area | Card height | Card / learning area |
| --- | ---: | ---: | ---: |
| 320x740 | 605px | 918px | 1.52 |
| 390x844 | 718px | 889px | 1.24 |
| 430x932 | 806px | 889px | 1.10 |
| 844x390 | 264px | 858px | 3.25 |

Those measurements exclude genuine native safe-area geometry. Oversized snap
areas can still scroll internally through browser behavior. The measured issue
is the competing reading/advance gesture and buried task hierarchy.

Keep the initial stage focused on a concise question, code/choices, and immediate
feedback. Put the explanation editor, tutor conversation, full references, and
reporting into deliberate detail surfaces. Keep a single vertical feed-scrolling
owner and a clear Next action after answering.

[Feed scroll layout](/Users/kenzietann/code/hackathon/frontend/src/app/homepage/homepage.css:106), [question structure](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.html:27), and [reference/report area](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.html:448).

### A03 — P1 — Reading-size accessibility lacks an app-level enlargement path

The layout uses fixed pixel sizes, including 10px navigation, 12px metadata, and
14px code/comment text. CSS fixes text-size adjustment at 100%. The current
Capacitor config has no zoom override, and the installed iOS bridge defaults to
disabled pinch zoom. No native Dynamic Type linkage was found.

Adopt scalable text roles and support native reading-size preferences or an
accessible app-level text-size control. Verify large accessibility sizes across
questions, code, comments, navigation, and forms. Actual OS-level behavior was
not exercised in this pass.

[Text adjustment](/Users/kenzietann/code/hackathon/frontend/src/styles.css:85), [navigation type](/Users/kenzietann/code/hackathon/frontend/src/app/homepage/homepage.css:90), [card type](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.css), and [native configuration](/Users/kenzietann/code/hackathon/frontend/capacitor.config.ts).

### A04 — P1 — The screenshot's question does not contain its claimed SQL error

The supplied screenshot shows valid SQL grammar:

```sql
SELECT id, name
FROM users
WHERE age >= 20;
```

The prompt asks for a syntax-error line. The current seed's matching question,
`894a7456-75cf-43c8-bb51-02f6b84a6cc3`, intentionally uses `WHER` on line 3.
The current dev API and the disposable API both return that corrected version.
The screenshot also has a slightly different title, so its exact content source
needs build/API/data-version alignment before assigning blame to current output.

The seeder updates quiz metadata on ID conflicts but does not update the complete
prompt/code/reference content. A corrected seed therefore needs a controlled
repair or a versioned question identity to reach an older persisted lesson.
Preserve the meaning of historical attempts when introducing a repair path.

Add educational-content integrity checks for reviewed demonstration questions.
Current quiz validation establishes shape and line bounds, with limited
JavaScript truncation parsing. It does not prove the asserted SQL mistake exists.

[Current seed](/Users/kenzietann/code/hackathon/backend/seed/question-pool.json:953), [seed update behavior](/Users/kenzietann/code/hackathon/backend/src/learning/question-pool.seeder.ts:65), and [AI validation](/Users/kenzietann/code/hackathon/backend/src/learning/gemini/gemini.service.ts).

### A05 — P2 — Daily markers and repeated metadata crowd the answer area

The supplied frame repeats Today's bug outside the card and inside a prominent
badge. The card then adds format, a long prompt, a title restating the prompt,
AI attribution, difficulty, and topics. The measured prompt consumed 116px at
390px width, followed by 44px of credit metadata.

Use one daily marker and a compact subject/level line. Keep identifiable creator
information for community contributions. Place the longer title and provenance
detail in the supporting information surface. Keep first-stage question copy
focused on the immediate tap action.

[Daily banner](/Users/kenzietann/code/hackathon/frontend/src/app/homepage/homepage.html:72) and [card metadata](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.html:27).

### A06 — P2 — Submission failures discard selection and give weak recovery

A controlled 503 reproduced the supplied generic message. The selected option
was cleared, and the card rendered zero Retry buttons. The message nevertheless
said the input was preserved. The user can tap again once buttons re-enable,
but the interface loses their choice and leaves the recovery action implicit.

Retain the chosen line/option and provide a visible Retry answer action that
resubmits that choice. Give connection, sign-in, and invalid-input states
operation-specific messages. The shared 400/422 copy currently gives publishing
instructions even for a quiz tap.

Tap grading uses stored answers and makes no AI call. Diagnose a failed tap
through transport, API, or session status.

[Tap lifecycle](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.ts:297), [error display](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.html:133), and [error mapping](/Users/kenzietann/code/hackathon/frontend/src/app/learning/learning-api.ts:88).

### A07 — P2 — Primary answer rows and some secondary controls are undersized

Rendered bug-answer rows measured 40px at every tested width. Adjacent candidate
rows touch. Next and suggested follow-ups have 36px minimum heights, and the
fallback Retry control has a 32px minimum.

Use at least 48 CSS px for interactive rows and comfortable secondary targets,
with spacing where needed. Plain non-interactive code can retain denser layout.
This recommendation uses the native target guidance. WCAG's smaller AA target
criterion has separate spacing and other exceptions.

[Code-row targets](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card-bug.css:17), [suggested follow-ups](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card-quiz.css:280), [Next](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card-quiz.css:427), and [Retry](/Users/kenzietann/code/hackathon/frontend/src/app/homepage/homepage.css:164).

### A08 — P2 — Comments overlays omit horizontal native safe-area padding

The fixed sheet header, body, composer, and guest footer use 20px horizontal
padding. With edge-to-edge native content, landscape phones need left/right
safe-area padding inside the sheet. The wide drawer starts at top zero, so its
header also needs an iPad status-bar check. A page-level strip cannot cover a
dialog drawn in the top layer.

Apply the native insets inside each overlay region and verify portrait,
landscape, keyboard-open, and expanded native layouts. These are source-backed
gaps awaiting a direct native layout check.

[Overlay header](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-discussion.css:73), [body](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-discussion.css:97), and [composer](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-discussion.css:215).

### A09 — P2 — Hot-combo text has insufficient contrast

The small white hot-combo text sits on an orange-to-pink gradient. Calculated
sRGB endpoint contrast is 2.04:1 on dark-theme orange, 3.61:1 on light-theme
orange, and 3.21:1 on pink. Normal small text requires 4.5:1 for WCAG AA.

Use a palette/foreground pairing that meets the text criterion across the whole
gradient, or use the existing higher-contrast accent treatment.

[Combo chip](/Users/kenzietann/code/hackathon/frontend/src/app/learning/learning-hud.ts:189) and [toast](/Users/kenzietann/code/hackathon/frontend/src/app/learning/learning-hud.ts:244).

### A10 — P2 — Guest deeper-learning navigation loses question intent

Explain why sends a guest to login without a question destination. Successful
authentication returns to the main feed, and the account identity change resets
that feed. The user must locate the question again. This was identified from
the route flow rather than an account-creation journey in this audit.

Preserve a public question return intent and reopen the requested explanation
task after authentication. Validate allowed in-app return routes.

[Guest explanation navigation](/Users/kenzietann/code/hackathon/frontend/src/app/learning/question-card.ts:345), [signup destination](/Users/kenzietann/code/hackathon/frontend/src/app/signup/signup.ts:174), and [login destination](/Users/kenzietann/code/hackathon/frontend/src/app/google-login/google-login.ts:389).

## Baseline positive findings

- Core body/muted contrast is strong in both themes. Calculated ratios are
  16.72:1 and 8.75:1 in dark, 15.60:1 and 6.75:1 in light.
- The sampled shared layouts had no horizontal document overflow.
- The HUD fit at 320, 390, and 430px for the controlled streak 12, level 17,
  daily 4/5, combo 5 state. A clipping defect was not established for that state.
- Most primary/social controls are at least 44px, inputs use 16px text, and the
  existing native shell provides status-bar/back/haptic integration.
- Theme tokens, consistent icon strokes, selectable body text, hover capability
  guards, live feedback regions, skeletons, and native dialog focus paths exist.
- The feed already has lazy routes, bounded retained cards, and frame-scheduled
  scroll work. Actual low-end-device frame behavior needs profiling.

## Original recommended implementation order

1. Align the installed native API target and development native-origin allowance.
2. Run `$impeccable layout` on the mobile learning stage. Consolidate daily/meta
   emphasis and move deeper tasks into focused detail surfaces.
3. Run `$impeccable harden` for answer recovery and return-to-question auth intent.
4. Run `$impeccable adapt` for 48px targets, text enlargement, native insets,
   landscape and keyboard checks, and the combo contrast fix.
5. Finish with `$impeccable polish`, then repeat the audit against native captures.

The next visual pass should start with the card's task hierarchy. Spacing changes
alone leave the oversized interaction structure in place.

## Resolution update — 8 November 2026

The coordinated fix pass implemented the findings below. Verification is scoped
per row so shared-layout/browser checks, build configuration, signed native
portrait evidence, and remaining device checks stay distinguishable. The
historical 12/20 rating describes the baseline before these changes.

| Finding | Resolution and verified scope |
| --- | --- |
| A01 — Native API target | The configured dev backend now allows the two local native origins. Other environment settings were preserved. Signed iOS and Android debug artifacts were rebuilt for `http://localhost:3000`, with bridge logging disabled and zoom enabled. The signed iPhone Simulator app was launched and its portrait feed captured. Both the signed iPhone Simulator and API 37 Android emulator launched the rebuilt app against the dev API and rendered the compact portrait feed. Keyboard, gesture, and landscape checks retain the limits recorded below. |
| A02 — Card task structure | The first stage now contains the concise question, code/choices, feedback and compact actions. Deeper learning and supporting information open through deliberate detail actions. In the shared 390px SQL fixture, the card measured 533.5px inside a 699px learning area, compared with the baseline failed-answer case at approximately 889px inside 718px. These are controlled shared-layout measurements with different recorded states. |
| A03 — Reading size | Profile now exposes persisted Standard, Large and Larger settings for guests and signed-in users. Learning, comment and related settings text uses scalable sizing. Larger produced a 20.8px root size with no horizontal document overflow in the tested 320/390/430px and 844px landscape layouts. The 320px bottom navigation grew to 91px while retaining its content. Native zoom configuration is enabled. System Dynamic Type behavior and actual pinch gestures need native accessibility verification. |
| A04 — Question-content mismatch | The installed API target is aligned with the current dev API. The current SQL fixture contains the intentional `WHER` typo, and a backend unit regression now guards that reviewed fixture. This addresses the observed old-snapshot incident. Future changes to answered seed lessons still require controlled versioned-content handling to preserve historical attempt meaning. |
| A05 — Daily/meta emphasis | The mobile first stage uses one daily marker and compact metadata. The complete original question and supporting provenance remain accessible through the detail flow. Browser layout checks cover the revised hierarchy. |
| A06 — Submission recovery | Failed taps retain the chosen answer and expose Retry answer for the same choice. Tap-specific messages and sign-in recovery replace unrelated publishing-form instructions. Regression coverage verifies recovery without producing a wrong grade. |
| A07 — Target sizes | Identified primary code-answer rows and secondary actions use 48px targets. The revised code rows measured 48px in the controlled shared layout. The change covers the audit's answer, retry, Next, suggestion and discussion-control paths. |
| A08 — Overlay safe areas | Discussion regions now apply horizontal safe-area padding, with safe-top protection for expanded drawers and preserved bottom padding. Detail surfaces use native inset protection as well. Signed native portrait layout was captured. Native landscape cutouts, expanded-device geometry and keyboard/IME states remain follow-up checks. |
| A09 — Combo contrast | Hot-combo chips and combo toasts now use the existing accessible accent/foreground token pairing. The low-contrast white-on-warm-gradient override was removed. |
| A10 — Auth return intent | Guest Explain why carries a validated public question return destination, and the shared question reopens the requested explanation task after authentication. New signup-return browser regressions pass on mobile and desktop. Password/web Google unit paths and existing browser coverage also pass. Provider calls in this run use isolated test responses. |

### Verified build and test record

Root's coordinated verification reported the following results.

| Check | Result |
| --- | ---: |
| Backend unit tests | 278 passed |
| Frontend unit tests | 269 passed |
| Disposable PostgreSQL integration tests | 48 passed |
| Browser tests | 56 passed |
| Backend/frontend production builds | Passed |

The automated browser/integration runs used disposable PostgreSQL and isolated
external-service responses. Native artifacts were rebuilt with the verified dev
API target, explicit logging policy and zoom configuration. Signed iOS portrait
launch/capture supplies the native runtime evidence for this pass.

### Follow-up native acceptance checks

- Landscape iPhone cutouts and expanded iPad/drawer status-bar geometry.
- Keyboard/IME-open layouts with Large and Larger reading settings.
- VoiceOver and TalkBack reading/focus order and state announcements.
- System Dynamic Type and actual pinch-enlargement behavior.
- Physical-device touch, safe-area and gesture behavior.

These checks extend the recorded browser and portrait-Simulator evidence. A new
full native audit score should follow those observations.

## Standards used

- Apple's touch and type guidance. [UI Design Dos and Don'ts](https://developer.apple.com/design/tips/)
- Android's 48dp target recommendation. [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
- The 4.5:1 normal-text threshold. [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)


Final native evidence is saved under `frontend/.impeccable/review/mobile-fixes-2026-11-08/`, including signed iOS and Android API 37 portrait captures against port 3000. The Android debug APK is 5,918,900 bytes.
