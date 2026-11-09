# WhyLint UI/UX audit — 2026-11-09

Scope: the local working tree (`fix/mobile-feed-scroll` = `main` at PR #14 plus 45 uncommitted changes).
Skills applied: `ui-audit` (report structure and checks), `improve-animations` (motion catalog,
severity), `review-animations` (craft bar), `mobile-native` (phone feel), `apple-design` (sheets and
gestures).

## How it was tested

A scripted real-user journey ran on nine device profiles against the disposable stack (real NestJS
API and PostgreSQL; Gemini and Google isolated):

- **Phones:** iPhone SE 320×568, iPhone 15 Safari 393×659, iPhone 15 app 393×852, Pixel 7
  412×839 and a phone in landscape at 844×390.
- **Tablets:** iPad mini 768×1024 and iPad Pro landscape 1194×834.
- **Laptop and desktop:** 1280×720 and 1440×900.

The journey on each device was:

1. First run and both onboarding steps.
2. The feed, an answer, then a touch swipe (a wheel scroll on desktop) to the next card.
3. The comments sheet: open, drag-dismiss and close.
4. All five tabs, then dark mode.
5. Sign-up: validation, then success.
6. As a signed-in learner: an answer and Profile.

Every screen was scanned for:

- horizontal overflow;
- controls pushed off-screen or covered;
- tap targets under 44 px;
- text under 12 px;
- clipped content.

Every interaction recorded its running animations (`document.getAnimations()`: property, duration,
easing). Paging, the comments sheet/panel and the theme switch were sampled per frame and recorded
on video.

Further passes:

- **Readability:** the two densest pool questions, at six sizes.
- **Reduced motion, keyboard and focus.**
- **Android emulator** (API 37, real touch through `adb`): onboarding, paging (short, long fling,
  back, tiny), answering, the comments sheet (open, drag-dismiss, short drag), rotation, and Back.

**Not run:** a full iOS Simulator journey (only paging was tested there, after access was granted), Safari,
physical devices, VoiceOver/TalkBack, and failure states such as offline and 5xx.

Evidence: `frontend/.impeccable/review/ui-audit-2026-11-09/` (git-ignored screenshots and videos).

## Verdict

The core loop works everywhere. Across nine devices there were zero failed steps, no horizontal
overflow, and no clipped text. On a real Android touch screen, swiping moves exactly one card even
on a long fling, goes back one on a downward swipe, and ignores a tiny flick. The comments sheet
follows the finger and dismisses or snaps back correctly. Reduced motion and focus handling are in
good shape.

There is one exception you reported, and it is confirmed in the iOS Simulator: **on iPhone, swipes
often do nothing**. The feed allows sideways panning (`touch-action: pan-x`), so iOS takes over any
swipe that drifts sideways and cancels it, and the app also drops arcs that start sideways (fix 0).
Beyond that, the remaining problems are about **reading** and **placement**:

- After answering, the code you need to study is faded.
- Dense questions shrink to unreadable sizes while the buttons around them stay large.
- Short questions float in a sea of empty space.
- On desktop, the comments panel makes the feed jump.

## Status after the fix pass

All of the fixes below were applied in the working tree afterwards. The status is what the code and
tests show; items marked "not re-checked" were not re-measured on devices.

| # | Finding | Status | Where |
|---|---|---|---|
| 0 | Feed paging stuck on iPhone | Applied: `touch-action: pinch-zoom` on the card, own release animation that stops on the next touch and follows flick speed, angle test | `homepage.ts`, `homepage.css`, `question-card-details.css`, `e2e/tests/feed-paging.spec.ts` |
| 1 | Answered lines fade | Applied: answered state keeps full strength; only unpicked lines dim to 0.6 | `question-card-bug.css` |
| 2 | Text shrinks below readable | Applied: fit range 0.72–1.2 with 13 px reading floor (11 px code), then the card scrolls | `question-card.ts`, `question-card-details.css` |
| 3, 4, 6 | Desktop panel, card height drift, Japanese breaks | Not re-checked in this pass | — |
| 5 | Guest CTAs are 21 px links | Applied: `.signin-cta` button, 48 px | `styles.css` |
| 7 | Theme switch out of step | Applied: transitions suspended during the switch | `styles.css`, `display-settings.ts` |
| 8 | Targets under 44 px | Applied: 44 px minimums in the paged card | `question-card-details.css` |

Checks after the fixes: frontend unit 226/226, production build 280.41 kB with no budget warning,
Playwright 51 pass / 3 skipped / 10 fail (Google-fixture tests that need port 4200, the same as
before the fixes). The native apps are audited separately in
[native-audit-2026-11-09.md](native-audit-2026-11-09.md).

## Priority fixes

### 0. Feed paging gets stuck on iPhone, and the drag isn't native-smooth — HIGH (user-reported; fix first)

**Swipes that do nothing, so you retry 2–3 times (root cause confirmed in the iOS Simulator).**

Setup: iPhone 17, iOS 27.2, in the Simulator, with an on-screen log of the swipe handler's events.
Gestures were injected with `touch_path`.

Cause 1: iOS takes the gesture away from the app.

- The compact feed has `touch-action: pan-x pinch-zoom` (`homepage.css:454`). Because `pan-x` is
  allowed, WebKit claims any swipe with sideways drift as a native horizontal pan. It then sends
  `pointercancel`, and `cancelSwipe()` jumps the card back.
- A swipe of 100 px up with only 11 px of drift was cancelled (`drag start v=20` →
  `POINTERCANCEL dragging=true` → `go card 1 … auto`). Perfectly straight swipes worked.
- Real thumbs always drift, so swipes fail at random. That matches having to retry 2–3 times.

Cause 2: the app drops thumb arcs itself.

- `onPointerMove` (`homepage.ts:263–266`) abandons the gesture if the first 10 px are more sideways than
  vertical (`horizontal > 10 && horizontal > vertical`).
- A thumb arc that starts sideways and curves upward is dropped (`DROPPED as horizontal h=12 v=4`). This
  happens even when cause 1 is fixed.

Verified fix for cause 1:

- Rebuilt with the feed set to `touch-action: pinch-zoom` (pinch zoom kept, `pan-x` removed). Every
  gesture that failed then paged one card:
  - 100 px up with 11, 17, 25 and 48 px of drift;
  - drifting swipes starting on question text, choices and spot-the-bug code lines;
  - repeated swipes down, back to card 0.
- The code blocks keep their own `touch-action: pan-x pinch-zoom` (`question-card-details.css:223–227`),
  so wide code still scrolls sideways.
- `touch-action: none` behaved the same but also disables pinch zoom, so `pinch-zoom` is the better
  choice.

To-do for cause 2: decide direction from more movement (for example, wait for 16–20 px, or check the
angle over the whole gesture) instead of the first 10 px.

**Also a bug: interrupting the settle leaves the card off-position (reproduced in Chromium).** When you release a swipe, `scrollToIndex()` (`homepage.ts:347–363`)
immediately makes the next card active (`feed.setActive(target)`) and records `pagingTarget`. It then
hands the move to `content.scrollTo({ behavior: 'smooth' })`, which settles over 300–500 ms.

- On iOS, a finger landing on an animating scroll view stops it where it is. That happens with a quick
  second swipe or a tap during the settle, which is normal TikTok-style use.
- Reproduction (Chromium, with that stop emulated by pinning `scrollTop` 120 ms into the settle, then a
  tap): the feed stayed **115 px between card 1 and card 2**, with `activeIndex: 2`, `pagingTarget: 2`
  and card 1 on screen.
- The following swipe down did **not** go back a card. It only re-aligned the card already showing,
  because the swipe started from the stale index. Swipe up then moved on normally.
- `pagingTarget` is cleared only when the target card is reached, on a tab change, or on a resize. So a
  stopped settle leaves `onScroll()` (`homepage.ts:190–224`) skipping active-card updates, and the next
  gesture is computed from the wrong card.
- A tap that doesn't drag (`onPointerUp` returns early when not dragging) never re-snaps, and the
  compact feed's `scroll-snap-type: mandatory` doesn't rescue it either: the 115 px offset persisted.
- Plain Chromium continues the smooth scroll through a tap (the card still lands correctly), which is
  why Android and desktop don't get stuck and the iPhone does.

**Not native-smooth.** The compact feed sets `touch-action: pan-x pinch-zoom` (`homepage.css:454`), so
native vertical panning is off. The finger is tracked by `onPointerMove` setting `scrollTop` on every
event (`homepage.ts:259–281`).

- On an iPhone, native scrolling runs at 120 Hz on the UI process. This path runs on the web main
  thread, and each position must be committed back to the UI process, so the card trails the finger and
  any main-thread work shows up as dropped frames.
- Contributing: the `(pointermove)` and `(scroll)` template bindings run Angular change detection on
  every event. The profile shows template and effect functions in the drag; about 22 ms over a
  40-move, 67-scroll-event drag at 4× CPU in Chromium.
- `classList.add('is-swiping')` rewrites the class attribute on every move (40 mutation records for 40
  moves).
- The settle is the browser's `scrollTo smooth`: fixed curve and velocity-blind.
- Chromium alone held 60 fps (p95 16.7 ms); the cost is iOS-specific and must be confirmed on the
  device.

**Likely contributor, unverified (needs WebKit).** Question text is selectable. Only buttons have
`user-select: none` and `-webkit-touch-callout: none` (`styles.css:102–104`). On iOS a press-and-hold
before dragging can start text selection, which fires `pointercancel` → `cancelSwipe()` → an instant
jump back to the original card.

**Fix plan:**

0. **Stop iOS and the app from eating swipes (do this first; it is the "have to retry" bug).**
   - Change the compact `.feed-content` from `touch-action: pan-x pinch-zoom` to
     `touch-action: pinch-zoom`. Keep `pan-x` on the code blocks only.
   - Replace the 10 px "sideways first" check with an angle test over at least 16–20 px of movement.
1. **State from position, not intent.**
   - On `pointerdown`, cancel any settle in progress and clear `pagingTarget`.
   - Re-base `index` on the card nearest the current `scrollTop`.
   - After every gesture, a tap included, snap to the nearest card if the offset isn't 0.
   - Call `setActive` when the card is reached, not when the move starts.
2. **Own the settle animation.** Replace `scrollTo smooth` with a requestAnimationFrame settle (or a
   spring) seeded with the release velocity, which stops cleanly on the next touch. Behaviour then
   matches on iOS and Android, and it can feel velocity-aware.
3. **Take the drag off the main thread where possible.** Bind `pointermove` and `scroll` with
   `addEventListener` outside the template so they don't schedule change detection. Add `is-swiping`
   once, when dragging starts.
   - The bigger win is to let iOS pan natively: drop `touch-action: pan-x pinch-zoom` and rely on
     `scroll-snap-type: y mandatory` with `scroll-snap-stop: always`, which pages one card per fling
     natively.
   - The trade-off is giving up the 32 px custom threshold for the platform's velocity rule. That's a
     feel decision for the phone.
4. Add `-webkit-user-select: none` and `-webkit-touch-callout: none` to compact feed text, keeping code
   copy available elsewhere (Details).
5. Add a regression test: swipe, touch 120 ms into the settle, then assert the card is aligned and the
   index matches, and that the next swipe down goes back exactly one card.

### 1. Answered code lines fade, and the correct answer is the faintest (all devices) — HIGH

- After a spot-the-bug answer, the correct and wrong lines render at opacity **0.5** and the
  irrelevant lines at **0.6**. The line you need to study is lighter than the ones that don't
  matter.
- Light-theme contrast drops from 14.1:1 to **3.1:1**, below WCAG AA (4.5:1). In dark theme and
  landscape the code becomes nearly invisible (`03-phone-landscape.png`).
- Cause: `question-card.css:153` `button:disabled { opacity: 0.5 }` applies to `button.code-line`
  once answered. `.quiz-option:disabled { opacity: 1 }` (`question-card-quiz.css:78`) protects choice
  questions, but code lines have no such rule. `.code-line.state-dim { opacity: 0.6 }`
  (`question-card-bug.css:67`) wins on specificity, so the dimmed lines end up brighter.
- Fix: `button.code-line:disabled { opacity: 1; }`. Keep a dim only on uninvolved lines (about 0.55).
  The correct and wrong lines stay at full opacity, keeping their green and red fills.
- Reference: ui-audit `25-patterns-feedback` and `27-patterns-accessibility` (contrast).

### 2. Dense and answered cards shrink text below readable while the chrome stays full size — HIGH

The fitter keeps the question, code and every choice inline, as you decided. Measured on the two
densest pool questions:

| Viewport | Prompt | Code | Choices |
|---|---|---|---|
| iPhone Safari 393×659 | 10.6–12.9px | **8.3–10.1px** | 8.3–10.1px |
| iPhone SE 320×568 | 8–8.7px | **6–6.8px** | 8px |
| Phone landscape 844×390 | 8.7–9.1px | **6.8–7.1px** | 8px |
| iPhone app 393×852 | 16–17px | 12.7–13.3px | 12.7–13.3px |

In those states the 12–16 px action row (いいね/コメント/共有/保存, なぜ？, 詳細) and the 12 px nav are
two to three times larger than the content. The hierarchy is inverted (`02-dense-questions-shrink.png`).

After answering, the outcome bar takes height from the stage, so the same card shrinks further at
exactly the moment the learner should read the code. In landscape it drops to about 8 px with the
fade from fix 1 on top.

**Fix, keeping your inline decision:**

- Set a floor (code ≥ 11px, prompt and choices ≥ 13px).
- When content still doesn't fit at the floor, let the stage scroll internally rather than shrink
  further.
- After answering, put the outcome where the action row was (replace, don't stack) so the stage
  keeps its height.

### 3. Comments panel on desktop: the feed teleports while the panel slides — MEDIUM

- At 1440×900, opening comments moves the card **180 px left in one frame** (440→260 px), while the
  panel slides in over about 220 ms. Closing snaps it back the same way (`10-desktop-panel-motion.webm`).
- The content jumps while its neighbour animates, which breaks spatial continuity.
- Fix: either overlay the panel without reflowing the column, or move the column with the same
  `transform` and curve as the panel (`320ms var(--ease-drawer)`) using FLIP. Animate `transform`,
  not `left` or grid widths.
- Reference: improve-animations AUDIT §8 (missed opportunity) and §5 (transform only).

### 4. Cards float in empty space; the question's starting height drifts — MEDIUM

- `question-card-details.css:154–158` vertically centres the stage (`justify-content: center`), and
  type is capped at 18 px.
- On a 393×852 phone, **172–199 px is empty above and the same below** the content on every card,
  about 45% of the card.
- On a 320×568 phone, the question starts anywhere from 22 to 108 px down, varying card to card. In
  a swipe feed the eye has to re-find the question every time (`06-android-paging.png`).
- Fix: anchor the stage to the top with a consistent offset, so the question always starts in the
  same place. Use the spare height to raise the 18 px cap on tall phones (the fitter already measures
  the space).

### 5. Guest calls to action are 21 px text links, and Ranking has none — MEDIUM

- Practice ("ログインして復習", 125×21), Post ("ログインして質問を投稿", 173×21), Profile ("ログイン", 62×21)
  and comments ("ログインしてコメントする") offer sign-in only as a small inline link under a lot of
  empty space.
- Ranking's empty state says 最初の問題に挑戦しよう with no action at all.
- These are the conversion points from guest to account.
- Fix: one 48 px primary button per empty state, with a one-line benefit. Ranking's button should
  jump back to the feed.
- Reference: `29-patterns-onboarding`, `25-patterns-feedback`, 44 px targets.

### 6. Japanese labels break mid-word — MEDIUM

- The bottom nav "プロフィール" wraps to "プロフィー / ル" at 320 px wide. The `.main-nav button` rule
  is 0.75rem with no `white-space` rule.
- Profile → 文字の大きさ "さらに大きい" breaks as "さらに大 / きい" at 393 px (`01-iphone-393x659-journey.png`).
- Fix: `white-space: nowrap` for nav labels, `word-break: keep-all` for Japanese option labels, or a
  shorter label. Check again at 320 px with Larger text.

### 7. Theme switch is out of step — LOW

- Page, card and background colours change instantly, while every button fades its colour over
  150 ms (`styles.css:105`). For about 150 ms the buttons show the old theme on the new page.
- Fix: suppress transitions for the frame of the theme change (a class on `:root` that sets
  `transition: none`, removed after one frame), or transition the root surfaces the same way.
- Reference: AUDIT §7 (cohesion).

### 8. Answer targets below 44 px in landscape and at 320 px — LOW

- Answerable code lines measure 32–39 px tall at 844×390 and 320×568. That's accepted in the
  previous audit, but these are the primary controls.
- With the floors from fix 2, keep at least 44 px for answer rows.

## Smaller polish (LOW)

- **Signup button:** at iPhone Safari height (393×659) only a sliver of "アカウントを作成" shows at the
  bottom edge. Tighten the space above the title or make the button sticky.
- **Onboarding technology list:** a fixed-height scroll area inside a scrolling page, with a
  half-cut row of chips and no fade. Add a bottom `mask-image` fade (`05-onboarding-step2.png`).
- **Theme toggle:** the text button "ダーク" on onboarding and auth vs a moon icon in the app header.
  Use one pattern.
- **Outcome bar:** the primary "次へ ↓" pill sits next to the label in the middle, while the
  secondary "解説を見る" holds the right edge. Put the primary at the trailing edge.
- **Links:** the logo link is 23 px wide. Links get the browser's 1 px focus ring, because
  `styles.css:111` lists only button, input, select and textarea for `:focus-visible`. Add `a`.
- **Card action labels on desktop and iPad landscape** are 11 px.
- **Paging settle** uses the browser's `scrollTo({behavior:'smooth'})`: 300–500 ms depending on card
  height (iPad mini 918 px → 500 ms). It ignores release velocity. It works and feels acceptable on
  Android; a velocity-aware settle would feel closer to TikTok. This is a feel judgement; check it on
  a physical iPhone.

## What passed

| Area | Result |
|---|---|
| Journey on 9 profiles | 23 steps each on touch devices, 21 on non-touch; 0 failures; only expected guest 401s in the console |
| Overflow and clipping | No horizontal overflow and no clipped text on any screen |
| Android paging (real touch) | Short swipe +1, long fling +1 (capped), swipe down −1, tiny flick 0; position kept through rotation |
| Comments sheet (web and Android) | 320 ms `--ease-drawer` rise, about 200 ms visually; follows the finger; drag-dismiss works; short drag snaps back |
| Press feedback | `scale(0.97)`, 60 ms press and 160 ms release, ease-out |
| Reduced motion | Shake, pop and slide removed; fades kept; sheet opacity-only; paging instant |
| Keyboard and focus | Logical tab order; 2 px accent ring on buttons and inputs; focus to the sheet heading on open and back to the button on Escape; ↓ pages instantly; onboarding step 2 focuses its heading |
| Bottom spacing | Profile content clears the tab bar by 72 px |
| Signup validation | Empty submit focuses e-mail and shows a specific message |
| Android landscape | Rail navigation, and the card fits |

## Motion inventory (improve-animations format)

| # | Severity | Category | Location | Finding | Fix summary |
|---|---|---|---|---|---|
| 1 | MEDIUM | Missed opportunity / physicality | homepage layout on desktop with `has-discussion` | Feed column jumps 180 px in one frame while the panel slides | Overlay, or FLIP the column with `320ms var(--ease-drawer)` |
| 2 | LOW | Cohesion | `styles.css:105` button transitions | Buttons fade 150 ms during theme switch while surfaces snap | No-transition class for the theme flip frame |
| 0a | HIGH | Interruptibility (gesture) | `homepage.css:454` `touch-action: pan-x pinch-zoom`; `homepage.ts:263–266` | iOS cancels drifting swipes (`pointercancel`); the app drops arcs that start sideways, so swipes fail and must be retried | `touch-action: pinch-zoom` on the feed (verified in the Simulator); angle test over 16–20 px |
| 0 | HIGH | Interruptibility | `homepage.ts:347–363` `scrollTo smooth` and `pagingTarget` | A touch during the settle (iOS stops the scroll) leaves the card 115 px off and the active index stale; the next swipe is wrong | Re-base on position at `pointerdown`; own an interruptible, velocity-seeded settle |
| 0b | HIGH | Performance | `homepage.css:454`, `homepage.ts:259–281` | Finger tracking runs on the main thread (`scrollTop` per `pointermove`, change detection per event), not native 120 Hz scrolling | Listeners outside the template; consider native snap paging on iOS |
| 3 | LOW | Easing and duration | `homepage.ts:363` `scrollTo smooth` | Settle is 300–500 ms, distance-scaled, velocity-blind | Covered by fix 0 |
| — | OK | — | `question-discussion.css:29–48` | Sheet transform and backdrop, interruptible transitions, `@starting-style` | Keep |
| — | OK | — | `question-card-quiz.css` `pop`/`shake`/`slide-up` | 240–320 ms ease-out / in-out feedback, reduced-motion safe | Keep |
| — | OK | — | `learning-hud.ts` `flare`, `xp-pop` | Spring on rare celebrations | Keep (the detector's spring advisories are acceptable here) |
| — | OK | — | `homepage.css:208` `nudge` | 1.2 s × 3 swipe hint after 600 ms on first cards | Keep; it's rare and stops |

## Device matrix

| Device | Journey | Notable |
|---|---|---|
| iPhone SE 320×568 | Pass | Nav label break; dense code 6–7px; question start drifts 22–108px |
| iPhone 15 Safari 393×659 | Pass | Signup button below fold; dense code 8–10px; "さらに大きい" breaks |
| iPhone 15 app 393×852 | Pass | ~45% of each card empty; type capped at 18px |
| Pixel 7 412×839 | Pass | Same as above |
| Phone landscape 844×390 | Pass | Answered code ~8px and faded; answer rows 32–39px |
| iPad mini 768×1024 | Pass | Paging settle 500ms |
| iPad landscape 1194×834 | Pass | Card taller than viewport (855 vs 769); 11px action labels |
| Laptop 1280×720 | Pass | Card taller than viewport (855 vs 655); panel jump |
| Desktop 1440×900 | Pass | Panel jump; 11px action labels |
| Android emulator API 37 | Pass | Real-touch paging, sheet, rotation and Back all correct |
| iOS Simulator, iPhone 17 / iOS 27.2 | Paging only | Drifting swipes cancelled by iOS and arcs dropped by the app; `touch-action: pinch-zoom` fixes the first (verified) |

## Status of the 2026-11-08 findings

Verified fixed in use:

- one-card paging and exact-height cards (P1-01/02);
- onboarding step focus (P1-06);
- the guest Profile label ("ログイン").

Not re-tested this round:

- short-viewport comments composer (P1-07);
- theme state shared across auth pages;
- draft persistence;
- shared-question 503 recovery;
- Saved error state.

Still open from that list:

- comment delete has no undo;
- native Google pending-state recovery;
- runtime Google Fonts.
