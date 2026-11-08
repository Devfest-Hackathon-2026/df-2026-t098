# WhyLint core learning engine

## Readable question snippets

- Request normal line breaks and indentation from Gemini for every code example.
- Format supported JavaScript/TypeScript and web-language snippets on the backend
  before returning public questions. Reuse the installed Prettier package as a
  production dependency so the browser bundle stays small.
- Apply the same formatting to existing questions and replayed feed/publication
  responses. Preserve stored source and grading data. Return unsupported-language
  or unparseable legacy snippets as provided instead of breaking question reads.
- Formatting parses text only. Never execute question code or load project-defined
  formatter configuration/plugins. Verify the reported counter example, legacy
  data, replay behavior, and safe failure with isolated tests.
- Verification passed with the backend build, 165 unit tests, and 35 disposable
  PostgreSQL integration tests. Playwright MCP confirmed all nine formatted counter
  lines render exactly at phone and desktop widths using an isolated question fixture.

## Safe AI failure diagnostics

- Keep the existing AI error codes and add a static `reason` plus an optional
  numeric `upstreamStatus` to distinguish provider failures and rejected output.
- Report only predefined categories. Never return provider response bodies,
  request headers, keys, model configuration, prompts, or learner answers.
- Distinguish token limits, malformed output, repeated questions, and truncated
  JavaScript so a feed-generation 503 can be diagnosed from its response body.

## Language settings and skeleton loading

- Remove the previous/next question arrow controls and their reserved space on
  every viewport. Scrolling remains the feed navigation and still triggers the
  next five-question batch when the third card becomes active. Keep the feed
  scroll region keyboard accessible.
- Remove the upper-right language toggles from all screens. Offer native Japanese
  and English choices in onboarding and an authenticated Profile Settings section.
  Onboarding updates the interface immediately; completing it saves the selection.
  Profile changes save to the account before applying, with pending/error feedback.
- Store optional `language: 'ja' | 'en'` in learning preferences. Existing records
  without that field use the saved device language or Japanese. Preserve account
  language when an older client saves interests without sending a language.
  Add authenticated `PATCH /api/v1/learning/preferences/language` with `{language}`
  to update only language atomically. Reuse Origin/JSON/session validation and rate
  limiting. JSON preferences need no database migration.
- Restore account language with preferences on navigation/new devices. Handle
  failed writes, logout/account changes, and preserve unrelated learning choices.
- Replace visible content-loading messages with reusable, non-interactive skeleton
  layouts for the feed, reviews, profile, rankings, shared questions, comments, and
  session restoration. Keep accessible screen-reader status text and meaningful
  error/empty states. Keep action-button pending feedback and existing content usable
  during prefetch. Preserve WhyLint's current palette, themes, and readable inputs.
- Verify scroll-only prefetch, onboarding/profile persistence and legacy records,
  skeleton loading/recovery, and auth regressions through unit, disposable database,
  mobile/desktop Playwright, and rendered UI review. Only the user runs Git commands.
- Verification passed with both production builds, 149 backend unit tests, 131
  frontend unit tests, 34 disposable-PostgreSQL integration tests, and 34 mobile/
  desktop browser tests. Playwright MCP inspected 20 captures covering narrow phone,
  phone, tablet, desktop, landscape, both languages/themes, and skeleton/error states.
  The independent UI reviewer returned `ship` for this refinement and the
  documentation consistency check required no further changes. Physical Capacitor
  device verification remains a separate check.

## Incomplete JavaScript snippets

- A real generated question was saved with JavaScript ending mid-object. Treat
  obviously truncated JavaScript as invalid before persisting a generated batch.
- Parse JavaScript as text without running it. Reject clear end-of-input and
  unterminated-token errors while allowing module and JSX examples that a script
  parser cannot fully validate. This check is deliberately limited to JavaScript.
- Ask Gemini for a replacement batch once when this specific validation fails.
  Keep the total generation request bounded and return the existing retryable AI
  error if the replacement is also truncated. Count the replacement against the
  existing per-user provider-call budget. Never persist a partial batch.
- Preserve existing questions and user data. Cover the reported snippet, successful
  replacement, repeated failure, valid examples, and non-execution with fixtures.
- Verification: the saved question was incomplete in the public API response.
  The backend build, 149 unit tests, and 33 disposable-PostgreSQL integration
  tests passed with synthetic Gemini responses. An existing saved question is not
  rewritten by the generation guard.

## Source readability pass

- Format the application, migrations, configuration, and test source across
  `backend/`, `frontend/`, and `e2e/`, following the two-space indentation,
  single quotes, and straightforward NestJS structure in the backend auth code.
- Preserve application behavior, API and database contracts, all existing work,
  user-facing content, test fixtures, and the exact text sent to Gemini. Break
  long Gemini prompts into readable source lines without changing their contents.
- Exclude environment files, dependency directories, lockfiles, generated builds,
  reports, screenshots, editor state, and bundled skill tooling. Only the user runs
  Git commands. Keep work in the feature checkout the user created.
- Check formatter output for syntax and semantic preservation, run the application
  builds, relevant unit tests, disposable PostgreSQL integration tests, and the
  mobile/desktop browser suite. Restore the normal frontend if it must be stopped
  for the browser tests. Real Google/Gemini credentials and development data are
  outside the test setup.
- Verification: 148 source/configuration files were checked and 122 reformatted.
  The three Gemini request bodies matched their original bytes; TypeScript, Angular
  template, stylesheet, and configuration structure was checked against the original
  sources. Production frontend JavaScript and CSS were byte-for-byte unchanged.
  Both builds, 140 backend unit tests, 125 frontend unit tests, 31 disposable
  PostgreSQL integration tests, and 32 mobile/desktop Playwright tests passed.
  The normal frontend and its API proxy were restored after the browser tests.

## Scope and working agreement

The user created `feat/core-learning-feed` from a clean main checkout. Only the
user runs Git commands. Inspect and edit files directly, preserve auth/session
behavior, and use disposable PostgreSQL databases for verification. No development
database migrations, credentials, deployments, or external messages during this work.

Deliver the full Angular/NestJS/PostgreSQL vertical slice. Gemini credentials arrive
later. Production uses the real Gemini adapter and reports an actionable unavailable
state when configuration is absent. Test fixtures are injected only by test harnesses.
Keep Japanese default, English support, WhyLint's existing neutral/green identity,
and responsive phone, tablet, and desktop layouts. Device/WebView testing is separate.

## Product behavior

- Onboarding chooses multiple interests, programming languages/frameworks, and a
  starting difficulty. Support a broad searchable catalog and bounded custom technology
  names. General concepts (JWT, HTTP, microservices, networking, security) are available
  to every learner. Migrate existing local `domain`/`stack` preferences without losing them.
- Persist authenticated preferences in PostgreSQL. Guests can choose preferences and
  read published questions. Sign-in is required for personal AI generation, assessment,
  progress, social writes, and publishing. Restore saved preferences on another device.
- Gemini generates exactly five questions per request. Include at least one general
  concept and use selected interests/technologies, difficulty, and recent weak concepts.
  Start the next request when the third card of the current batch becomes active.
  Keep scrolling and answering available while generation runs. One request per batch,
  persistent request IDs, no duplicate batches on retries. Prune old rendered feed cards
  to bound memory while retaining saved questions and failed practice on the server.
- Questions may be code-based or plain conceptual questions. Learners explain their
  answer in text. Gemini assesses understanding on an integer 0–10 scale against a
  stored reference and rubric. Scores 8–10 pass and include improvement feedback.
  Lower scores appear in a private retry collection. Passing a later attempt removes
  the question from that collection. A provider failure never becomes a failing score.
- Remove the old exhaustive local history panel. Show daily goal, XP/level, streak,
  achievements, saved questions, and failed questions to retry.
- Daily goal is five distinct graded questions. Dates, streaks, and weekly ranking use
  Asia/Tokyo calendar days and Monday week boundaries. First assessed attempt earns
  five XP; first pass adds fifteen XP, at most twenty lifetime XP per user/question.
  Authors receive no XP for their own questions. Award and result persistence are
  transactional and idempotent. Level = 1 + floor(total XP / 100). Badges are first pass,
  ten passed questions, and a three-day streak. Weekly leaderboard uses real earned XP.
- Users can publish a question with a reference explanation. Gemini reviews/corrects
  its reference before publishing. Treat supplied content as data, never as grading
  instructions. Reject unassessable submissions. Approved community questions may
  appear after an AI batch for other users, with author attribution. Keep the five
  generated questions intact; a community insertion is separate and at most one.
- MVP social controls are real likes, saved questions, flat comments, and stable share
  URLs. Comments are plain text, length limited, and authors can delete their comments.
  Public profiles expose a display label and optional avatar, never email addresses.

## Shared API contract

All paths start with `/api/v1/learning`. Authenticated endpoints reuse JwtGuard and
stored sessions. JSON writes enforce trusted Origin, strict DTO validation, bounded
input, and suitable per-user throttling. Errors include stable `code` when useful
(`AI_NOT_CONFIGURED`, `AI_UNAVAILABLE`, `REQUEST_IN_PROGRESS`, `INVALID_AI_RESPONSE`).
Never send credentials, grading rubrics, or reference answers in question responses.

Types:

```ts
type Difficulty = 'beginner' | 'intermediate' | 'advanced';
type Language = 'ja' | 'en';
interface Preferences {
  interests: string[];
  technologies: string[];
  difficulty: Difficulty;
  language?: Language;
}
interface Author {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}
interface Question {
  id: string;
  title: string;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  topics: string[];
  difficulty: Difficulty;
  language: Language;
  source: 'ai' | 'community';
  author: Author | null;
  likes: number;
  liked: boolean;
  saved: boolean;
  createdAt: string;
}
interface Assessment {
  id: string;
  questionId: string;
  score: number;
  passed: boolean;
  feedback: string;
  improvements: string[];
  explanation: string;
  xpAwarded: number;
  createdAt: string;
}
interface Progress {
  totalXp: number;
  level: number;
  streak: number;
  passedQuestions: number;
  dailyGoal: number;
  dailyCompleted: number;
  timezone: string;
  achievements: { id: string; earned: boolean }[];
}
```

- `GET /catalog` public → `{interests: {id,label:{ja,en}}[], technologies: string[]}`.
  Interests IDs: frontend, backend, database, security, networking, cloud.
- `GET /preferences` authenticated → `{preferences: Preferences | null}`.
- `PUT /preferences` authenticated body Preferences → `{preferences}`.
- `POST /feed/batches` authenticated body `{requestId: UUID, language}` →
  `{requestId, questions: Question[5], communityQuestion: Question | null}`.
  Concurrent matching requests return 409 while pending; completed requests replay
  the same result. Bind request IDs to their owner and request payload. Expired pending
  requests can safely retry after a bounded lease; late owners cannot overwrite them.
- `GET /community?language=ja` public → `{questions: Question[]}` (bounded 20).
- `GET /questions/:id` public → `{question: Question}` (optional authenticated social state).
- `POST /questions` authenticated body
  `{requestId: UUID,title,prompt,code?,codeLanguage?,topics,difficulty,language,referenceAnswer}` →
  `{question}` after Gemini review. No key/failure returns an explicit error, preserving
  the form draft. Replay a successful same-ID submission to prevent duplicate posts
  after a lost response; bind the ID to its owner and normalized input. Limit topic count
  and all text lengths. Code and codeLanguage must be supplied together or both omitted.
- `POST /questions/:id/attempts` authenticated body `{requestId: UUID, answer: string}`
  → Assessment. Persist AI results before acknowledging, dedupe submissions and XP,
  cap repeated assessment per user/question/day, and preserve answer on request failure.
- `GET /reviews` authenticated → `{questions: Question[]}` for unresolved failures.
- `GET /saved` authenticated → `{questions: Question[]}`.
- `GET /progress` authenticated → Progress.
- `GET /leaderboard` public → `{weekStart, timezone, entries: {rank,user: Author,xp}[]}`.
- `PUT /questions/:id/like` authenticated `{liked:boolean}` → `{liked,likes}`.
- `PUT /questions/:id/save` authenticated `{saved:boolean}` → `{saved}`.
- `GET /questions/:id/comments` public → `{comments: {id,text,author:Author,createdAt}[]}`.
- `POST /questions/:id/comments` authenticated `{text}` → comment.
- `DELETE /questions/:id/comments/:commentId` authenticated owner only → 204.

Stable browser share path is `/questions/:id`. Requests use credentials and no-store.
Frontend single-flight operations ignore stale responses after logout/account switch,
language/preference changes, or navigation, and keep independent loading/error states.

## Backend implementation boundaries

Use feature modules under `backend/src/learning/` and existing auth exports. Add a
reversible TypeORM migration and discover new entities in the datasource. Persist
preferences, questions, feed request records, attempts, unique per-user question
progress/XP, and social relations. Store reference/rubric only server-side. Avoid
long DB locks across AI network requests. Use constraints/short transactions to
serialize completions and prevent duplicate XP under concurrency. Shared questions
must be selected by language and matching/general topics, excluding own submissions.

Gemini provider lives in `learning/gemini/`. Configure GEMINI_API_KEY and GEMINI_MODEL
server-side, send key in header to fixed Google endpoint, bounded timeout, structured
JSON generation, and strict runtime response validation. No shell/code execution.
Separate methods generateQuestions, assessAnswer, and reviewQuestion. Provider output
is untrusted. No raw response/request/prompt logging. No fixture mode reachable through
production HTTP. Unit tests override transport; integration harness supplies local fixtures.

## Acceptance and milestones

1. Engine and migrations: preferences/catalog, authenticated generation, persisted
   five-question batches, third-card prefetch, timeout/retry and missing-key behavior.
2. Assessment and game: 0–10 scores, threshold 8, private failed collection and later
   pass removal, one-time XP, daily goal/streak/badges, weekly rankings.
3. Community and UI: author-reviewed posting, feed insertion, likes/comments/save/share,
   broad onboarding, compact profile, responsive layouts and auth regression preservation.
4. Verification: backend and frontend builds/unit checks, real disposable PostgreSQL
   integration tests, mobile and desktop Playwright suite, MCP exploration of actual
   rendered screens. Explicitly verify no credential/reference leaks, duplicate replay,
   failure recovery, privacy and lifecycle races. Real Gemini and Capacitor hardware
   verification remain pending credentials/device access and must be reported accurately.

## Work allocation

- Backend agent owns learning entities, migration, controllers/services/DTOs,
  auth exports, app module/datasource registration, backend feature tests.
- Frontend agent owns frontend application/UI/types/services and frontend tests.
- Root owns Gemini provider, top-level specification, E2E integration/coordination,
  test harness, review and documentation. Follow-up reviewer works read-only initially.

## Verification record — 2026-11-07

- Backend production build and 140 unit tests passed. All 31 HTTP/PostgreSQL
  integration tests passed against a disposable local database, including concurrent
  request ownership, replay, lease replacement, score threshold, retry collection,
  one-time XP, social ownership, and publication idempotency.
- Frontend production build and 125 unit tests passed. Existing auth regressions
  were retained while static sample-feed tests were replaced by the real feed contract.
- Playwright typecheck and all 32 mobile/desktop browser tests passed using the real
  app servers, actual migrations, disposable PostgreSQL, and isolated Google/Gemini
  external responses. The stack stopped and removed its temporary clusters.
- Playwright MCP inspected onboarding, concept/code cards, score feedback, reviews,
  progress, ranking, publishing, comments, and unavailable-AI state. Captures cover
  320px, 390px, 768px, 844px landscape, and 1280px widths, plus both themes/languages.
  Evidence is local under `frontend/.impeccable/review/core-learning/` (26 captures).
- Independent finish review identified primary-hover contrast and code/language
  pair feedback. Both were fixed, recaptured, and scored resolved with a `ship`
  verdict limited to those findings. Documentation review confirmed the existing
  design context matches this extension.
- Homepage CSS is 4.59 kB, above its 4 kB warning threshold and below its 8 kB error
  limit. The frontend build succeeds. Initial bundle is 492.11 kB.
- Real Gemini generation/scoring, actual Capacitor hardware, and Cloud Run deployment
  still require separate verification. Gemini key/model configuration is intentionally
  absent from production runtime until the user supplies it locally.
- Development follow-up: at the user's explicit request, applied
  `LearningEngine1794000000000` to the normal local development database. Verified
  all seven learning tables, no pending migrations, and preserved account/session
  counts. Stopped the disposable preview stack and restored the normal frontend
  proxy to the backend on port 3000. All Git operations belong to the user.

## Gemini model update — 2026-11-07

- Use `gemini-3.8-flash` in the local backend's `GEMINI_MODEL` setting for
  question generation, answer assessment, and community question review.
- Follow Google's Gemini 3.8 migration guidance by omitting the fixed temperature
  override from the shared generation configuration. Keep structured output,
  response validation, and the existing request limits.
- Verify the configured model and default sampling with mocked transport, run
  the backend build and unit tests, then restart the local backend and check the
  public API through the normal frontend proxy. Live Gemini output requires a
  separate manual check in the app.
- Verified the model setting while preserving every other environment setting.
  The backend build and all 165 unit tests passed. After restart, the backend
  catalog, frontend page, and frontend API proxy each returned HTTP 200.

## Beginner difficulty, comments, and desktop layout — 2026-11-07

### Requirements and implementation

- Beginner generation assumes little prior knowledge of the chosen topic. Each
  question asks about one concrete idea in plain language, with a short example
  where helpful. Define any necessary jargon and keep code small. Reference
  answers and rubrics assess that same introductory idea. Intermediate questions
  may connect concepts, while advanced questions may explore internals and tradeoffs.
- Constrain generated difficulty to the onboarding selection in the JSON schema
  and validate the returned difficulty. General technology questions follow the
  same level. Preserve the five-question batch and third-card prefetch contracts.
- Place the existing comments panel immediately after the social actions, before
  the answer or assessment. Opening it reveals and focuses its heading. Provide a
  close control that returns focus to Comments. Retain loading skeletons, error
  recovery, author-only deletion, and authenticated posting.
- At desktop widths, the app shell fills the viewport and feed cards fill the
  available content column alongside navigation. Remove the shell's 1480px cap
  and feed's 760px cap for desktop. Preserve the existing mobile layout, native
  scrolling, safe areas, and selectable learning content.

### Acceptance and verification

- Mocked Gemini tests cover level-specific instructions, exact schema difficulty,
  and rejection of a mismatched level. Semantic difficulty needs manual review
  of fresh live questions. Existing stored questions keep their original content.
- Component and browser regressions cover opening comments before and after
  grading, heading visibility, close/focus return, and posting a comment.
- Check full-width desktop geometry, mobile overflow, and the existing learning
  and authentication flows using Playwright Test against the real backend and a
  disposable PostgreSQL database with isolated Google/Gemini responses. Inspect
  the rendered UI with Playwright MCP. Actual Capacitor hardware remains a
  separate device check.

### Verified results

- Backend build and 169 unit tests passed. All 35 HTTP/PostgreSQL integration
  tests passed against disposable data, and the temporary database was removed.
- Frontend build and 133 unit tests passed. The build has a non-fatal initial
  bundle warning at 500.56 kB against a 500 kB warning budget. Homepage CSS fits
  its warning budget.
- Playwright typecheck and all 36 mobile/desktop browser tests passed. Regressions
  cover comments before and after grading, focus restoration, persisted posting,
  full-width desktop cards, and full-width loading skeletons. The browser test
  stack used the real backend and disposable PostgreSQL with external services
  isolated, then stopped and removed its temporary cluster.
- Playwright MCP checked 320px, 390px, 768px, 1280px, and 1920px widths. Comments
  headings stayed visible, content stayed within the viewport, and the desktop
  card used the available width. Live Gemini question difficulty and actual
  Capacitor-device behavior remain manual verification tasks.

## Centered desktop feed and comments panel — 2026-11-07

### Product direction

The latest reference supersedes the full-width desktop question requirement.
Keep the full-screen shell and current navigation, with a centered learning
column and a vertical social-action rail on desktop. Use WhyLint's typography,
themes, icons, and Japanese/English content. On phones, retain readable learning
content and use the bottom-sheet comments presentation selected by the user.

### Component contracts and behavior

- Keep the feed's existing scrolling owner, five-question batches, third-card
  prefetch, and pruning behavior. Desktop reading width is approximately 600–680px
  inside a centered group that also contains the action rail. Long code scrolls
  horizontally and long learning feedback remains reachable vertically.
- Give the homepage one open-comments question ID and bind each card's discussion
  state to it. Close comments when changing tabs, accounts, or the active question.
  Shared-question routes expose the same card and panel behavior.
- Move discussion fetching, posting, deletion, loading, errors, and draft state
  into a dedicated question-discussion component. Keep author-only deletion and
  safe text rendering. Preserve drafts on close and avoid refreshing the list
  during a pending mutation. Account/question changes abort stale requests.
- At widths of at least 1200px, comments occupy a 360px right-side panel. Reserve
  space for the panel so the question and actions remain usable. The panel is
  non-modal and has independent list scrolling with a persistent header/composer.
- Below 1200px, use a native modal bottom sheet with an accessible heading, focus
  containment, Escape/Close/backdrop dismissal, safe-area padding, and 16px inputs.
  Native dialog presentation changes when crossing the responsive breakpoint.
- Opening comments focuses their heading. User dismissal restores focus to the
  originating Comments button without moving the feed. Closing from navigation
  preserves the current scroll position. Each visible control performs an existing
  supported operation. The reference's replies, comment likes, and counts have no
  matching API contract in this change.

### Acceptance and verification

- Add component regressions for dialog state, draft retention, close/focus return,
  safe comments, and asynchronous ownership. Preserve assessment/social tests.
- Update browser checks for centered desktop geometry, adjacent vertical actions,
  right-panel positioning, usable question controls while comments are open,
  mobile focus containment, Escape/backdrop dismissal, posting, and responsive
  transitions. Keep authentication and learning-flow coverage.
- Run builds and existing unit/integration/browser suites with disposable database
  data and isolated external services. Inspect rendered mobile, tablet, wide,
  localized, themed, and long-content states through Playwright MCP. Actual
  Capacitor keyboard/device behavior requires a separate hardware check.

### Verified results

- Backend build and 169 unit tests passed. All 35 integration tests passed with
  disposable PostgreSQL data, and the temporary database was removed.
- Frontend build and 135 unit tests passed, including draft retention during a
  pending post and modal forward/reverse keyboard focus. The production build
  reports non-fatal warnings at 511.28 kB initial bundle size and 4.26 kB homepage
  CSS, against their 500 kB and 4 kB warning budgets.
- Playwright typecheck and all 36 mobile/desktop browser tests passed against the
  real backend with disposable PostgreSQL and isolated Google/Gemini responses.
  The tests cover centered geometry, the right panel, native sheet modality,
  loading guards, draft retention, focus containment, Escape/backdrop dismissal,
  posting after assessment, responsive transitions, and single-question ownership.
- Playwright MCP produced ten temporary review captures across 320px, 390px,
  768px, 1200px, 1280px, and 1920px widths plus 844x390 landscape. English/dark and
  Japanese/light states include long threads, confirmed posting, and empty state.
  Panel composers stayed visible and horizontal overflow checks passed.
- Independent source/capture finish review returned a ship verdict. Documentation
  review updated the existing core-learning surface brief. A file-scoped design
  detector exception records the Angular avatar binding false positive, and its
  verification scan is clear. Real Capacitor keyboard/touch checks remain pending.

## Tap-first quiz feed and learning loop — 2026-11-08

### Product direction

Every scroll is a quiz answered in seconds, like a short-video feed. Explanation
grading by Gemini stays as WhyLint's optional "Explain why" depth step.

### Requirements and implementation

- Questions carry a tap quiz: `format` (`choice`, `true_false`, `predict_output`,
  `spot_bug`), 2–4 `options`, a server-only `correct_option`, and a short
  `quick_explanation`. Legacy and option-less community questions use `explain`.
  Gemini generates mixed formats; the server shuffles choice/output options and sorts
  spot-the-bug line numbers so answer position carries no signal. Spot-the-bug code is
  never reformatted, so line numbers stay stable.
- `POST /questions/:id/taps {choice}` grades from stored data with no AI call. The
  first tap earns 5 XP; a passed explanation adds the remaining 15 (cap unchanged).
  Guests receive correctness without persistence. Answers are revealed only after a tap.
- Batches keep every valid question instead of failing on one bad field, retry once
  below three valid questions, and are topped up from the pool. Generation uses the
  `low` thinking level (`GEMINI_THINKING_LEVEL`). Rejections log a static reason only.
- A committed pool (`backend/seed/question-pool.json`, 179 questions across six
  interests, three levels, ja/en) is upserted at startup (`LEARNING_POOL_SEED=off`
  disables it) and served by public `GET /feed/pool`. It powers guests, every first
  load, gap filling while Gemini writes, and Gemini outages. `npm run pool:generate`
  regenerates it with the real provider.
- Spaced repetition (superseded on 2026-11-08, see "Daily Practice reviews"): a miss
  moved a question to box 1 (10 minutes), then correct reviews stepped through 1 day,
  3 days, and 7 days before mastery. A passed explanation
  resolves it. Due reviews are inserted into batches and the pool response.
- Adaptive difficulty: five of the last six first taps correct raises the level; two
  or fewer lowers it. Weak topics are ranked by miss rate; three-in-a-row topics get
  harder angles. Each card shows why it was chosen.
- `POST /questions/:id/follow-ups` answers a short follow-up grounded in the question
  (5 per question per day, answer first). `GET /daily` returns the shared Bug of the
  Day with first solvers. Progress adds combo, best combo, topic and interest mastery,
  weekly highlight, and ten achievements.
- Frontend: full-height snap cards, tap answers with instant reveal, haptics and
  motion (reduced-motion respected), a HUD with streak, daily ring, level and combo,
  toasts for level-ups and badges, in-session relearning four cards later, a guest
  sign-in card after three taps, a skip-setup onboarding path, a feed that survives tab
  switches, a mastery radar, quiz options in Post, and lazy-loaded routes.

### Verified results

- Backend build and 190 unit tests passed. All 40 HTTP/PostgreSQL integration tests
  passed on a disposable database, including taps, answer privacy, pool, follow-ups,
  the daily challenge, review scheduling, and adaptive difficulty.
- Frontend build passed with a 268 kB initial bundle (was 511 kB); 143 unit tests passed.
- The Playwright learning suite (6 tests × mobile/desktop) passed against the real
  backend, disposable PostgreSQL, the seeded pool, and isolated Gemini responses, run
  on port 4300 with `WHYLINT_E2E_FRONTEND_PORT` because the normal frontend held 4200.
  The Google sign-in browser suite needs port 4200 and was not re-run.
- Live Gemini (`gemini-3.8-flash`, `low` thinking): pool generation succeeded on all
  36 calls; a personalized batch, an explanation grade (9/10), and a follow-up answer
  each returned in about 4 seconds in the browser. Physical device checks remain pending.

## Social learning MVP — 2026-11-08

### Approved scope

Implement the four hackathon priorities from the product discussion. Repair the
four reviewed regressions, add explicitly shared explanations with replies and
Helpful votes, public creator profiles, and curated references/reporting. Extend
the existing tap-first feed and WhyLint visual system. Following feeds, per-topic
adaptation, and friend challenges belong to later work.

### Regression contracts

- Pool questions respect the requested/effective difficulty through candidate
  filtering. The shared daily challenge uses beginner-safe candidates so its
  common first card is accessible. Adaptive personalized batches retain their
  existing level progression.
- Tap replay after a successful review returns the latest committed tap outcome,
  with zero additional XP. Preserve first-tap and review scheduling rules.
- Persist completed tap outcomes by feed-item instance across tab/route changes.
  Relearning instances stay distinct from their original card. Reset cached state
  on account, language, or preference restart, and retain pruning bounds.
- Use the feed-item instance key for open-panel ownership and unique DOM IDs.
  Backend operations continue to use the underlying question UUID. Exactly one
  discussion panel opens when original and relearning copies coexist.

### API and data contracts

Extend existing learning comments and preserve legacy text-only callers.

- `QuestionComment` adds `kind` (`comment`, `explanation`, `question`, `correction`),
  `parentId` (nullable UUID), `helpful` (viewer boolean), `helpfulCount`, and
  `deleted` (boolean). Keep existing id/text/author/createdAt fields.
- `POST /learning/questions/:id/comments` accepts text, optional kind (default
  comment), optional parentId, and optional requestId UUID for retry-safe writes.
  Explanations allow up to 5000 characters, other contributions up to 1000.
  Replies have one level and must reference a root on the same question. A stable
  requestId replays the same write and rejects a different payload with 409.
- `GET .../comments` accepts optional authentication to personalize helpful state.
  Preserve the comments array envelope and include referenced parents of the
  latest discussion rows so replies cannot appear orphaned.
- `PUT .../comments/:commentId/helpful { helpful: boolean }` is authenticated and
  idempotent per user/comment. Self-votes are rejected. Helpful votes earn no XP.
- Author-only deletion preserves replies using a deleted-parent placeholder.
  Deleted text is omitted from public content and cannot receive Helpful votes.
- `GET /learning/creators/:userId` returns `{ creator, counts, questions,
  explanations }`. Creator contains id/displayName/avatarUrl. Counts contain
  questions/explanations/helpful. Lists contain at most 20 recent public items.
  Explanation entries contain comment fields plus questionId/questionTitle.
  Expose published contributions only, with no email, private answers, scores,
  failed collection, or authentication fields.
- Public questions add `references: { title, url }[]`, derived from a curated map
  of relevant official documentation for recognized topics. Label these Further
  reading. They are reference material and carry no verification badge. Empty
  references are valid. External links use HTTPS and safe new-tab attributes.
- `POST /learning/questions/:id/reports` accepts `reason` (incorrect, unclear,
  outdated) and optional details up to 1000 characters. One open report per
  user/question/reason is upserted, returning `{ id, status: 'open' }`. Reports
  require authentication, existing origin/JSON protection, and throttling. Keep
  report details private. This MVP records reports for team review.
- Add a forward migration and entities for comment metadata, Helpful votes, and
  reports. Legacy rows receive safe defaults. Preserve sessions and auth behavior.

### Frontend contracts

- Reuse the existing discussion drawer/sheet for typed contributions, one-level
  replies, Helpful toggles/counts, author profile links, and deleted placeholders.
  Retain draft/loading/error/focus ownership and keyboard/mobile behavior.
- After grading, Share my explanation opens an editable draft initialized from the
  learner's own explanation. Publishing is explicit, uses a stable requestId on
  retries, and refreshes/opens the discussion after success. AI feedback and other
  private attempt fields are not posted automatically.
- The discussion component accepts `viewId` (optional instance ID) and
  `refreshKey` (number), separate from questionId. Unique control/dialog IDs use
  viewId. RefreshKey reloads an already-open discussion after explicit sharing.
- Add lazy public `/creators/:id` profile routes, visible author links, and a link
  from the signed-in profile to its public contributions.
- Cards show available Further reading links and an authenticated report form
  with reason/details, pending/success/error states, and guest sign-in access.
- Preserve Japanese defaults, English, both themes, responsive centered desktop
  feed, non-modal desktop discussion and modal mobile sheet, safe areas, and 16px
  inputs. Use the mobile-native skill when editing the UI.

### Acceptance and verification

Cover all four regressions and the new normal entry points with targeted tests.
Verify reply ownership, same-question parent checks, retry payload mismatch,
Helpful idempotency/self-vote rejection, public-profile privacy, deleted-parent
behavior, report privacy/upsert, and legacy callers against disposable PostgreSQL.
Run backend/frontend builds and unit suites, Playwright typecheck and full browser
suite with isolated Google/Gemini responses. Explore mobile/desktop social flows
through Playwright MCP. Use a disposable preview backend/database, restore normal
dev servers after tests, and report actual results and device/provider limits.

### Verified results — social learning MVP

- Backend and frontend production builds passed. Backend unit tests passed 192
  tests across 16 suites. Frontend unit tests passed 154 across 16 suites.
- All 45 HTTP/PostgreSQL integration tests and all 42 mobile/desktop browser tests
  passed. Playwright typecheck passed. Coverage includes legacy comments, private
  profiles/attempts, explanation sharing/retries, reply ownership/deleted parents,
  Helpful idempotency, reports, and the four audited regressions.
- Browser/integration runs used disposable PostgreSQL and isolated Google/Gemini.
  Playwright MCP exercised explicit edited sharing, reporting, a second reader's
  Helpful vote/reply, and creator navigation against a separate disposable preview.
  At 320/390/768/1280/1920 px and 844x390 landscape, one panel opened, the composer
  remained visible, and horizontal overflow checks passed. Desktop question controls
  remained clickable after a sheet-to-panel resize. Captures are temporary files
  under `/private/tmp/whylint-social-*.png`.
- The production initial bundle is 278.36 kB. All 179 committed pool questions have
  curated Further reading metadata. The 27 unique official HTTPS reference URLs
  returned successful HTTPS responses during a link check.
- Independent cross-agent source reviews found no must-fix API/privacy/lifecycle
  issues. Bound-avatar detector false positives have exact-template exceptions.
- Following the user's earlier development-database migration instruction, applied
  SocialLearningCommunity1794200000000 to the normal configured dev database.
  Existing users/sessions/questions/comments/attempts/taps counts were preserved,
  and no migrations remain pending. Automated tests used disposable data.
- Report moderation uses the stored private report queue in this MVP. Actual
  Capacitor-device and live-provider verification are separate from this run.

## Fresh-question variety — 2026-11-08

The reported HTTPS cards ask the same question through paraphrases. Fresh feed
cards must avoid close rewordings within a batch, across pool/personalized batches,
and against the current session's shown questions. Deliberate reviews/relearning
remain eligible. Preserve distinct questions about the same broad topic and code
questions with different examples.

- Add bounded local question-similarity checks and explicit Gemini guidance to
  change the underlying concept/task, with the two reported HTTPS prompts as a
  regression. Include English/Japanese normalization and conservative handling of
  generic prompts/code. This is close-paraphrase detection, with no embedding or
  external similarity-service dependency.
- Feed batch requests accept optional `excludeQuestionIds` (unique UUIDs, max300).
  Include current pool/daily cards as generation context and exclude them from
  top-ups. Keep request snapshots stable across retries and restored pending
  requests. Preserve legacy callers and historical request replay.
- Backend checks generated candidates against recent generated and provided seen
  questions, and selects pool candidates for variety. Partial valid generation
  and pool fallback retain their bounded retry/transport/lease behavior.
- Supply public, versioned novelty hints derived only from public question content
  if needed for a final client-side cross-source race check. No answers, rubrics,
  or private attempt data appear in hints. Keep older responses compatible.
- Frontend fresh-card append checks novelty against existing/accepted fresh cards,
  covering pool results arriving while Gemini is still running. Reviews and
  deliberate relearning bypass fresh-card novelty checks. Never mark discarded
  cards as displayed. Keep pending requests/storage failures recoverable.
- Add targeted backend/frontend tests and real disposable-DB/browser regressions
  covering the reported pair, pool-to-Gemini duplication, retry snapshots, same
  topic/different concepts, different code examples, and intended reviews.
- Verify current builds, unit tests, disposable DB integration and browser suites.
  Prompt/generation checks use isolated provider responses. Existing saved content
  is evaluated for feed eligibility without rewriting learner attempts or grades.

Additional variety controls preserve different named cookie flags and the meaning
of identical code text under different code languages. Code-language-aware hints
and public recent-context projections share the same representation. Provider
context is bounded by serialized UTF-8 size, with 45,000 bytes for rich context
and 12,000 bytes for prompts. This leaves headroom inside the transport limit. Cached replay
hints use the same formatted public code representation as the initial response.

### Verified results — fresh-question variety

- Backend build and 207 unit tests passed. Frontend build and 172 unit tests
  passed. All 46 disposable-PostgreSQL integration tests, all 46 mobile/desktop
  browser tests, and Playwright typechecking passed. Existing social/auth flows
  remained covered by the full suite.
- Regression coverage includes the reported HTTPS pair and three seeded variants,
  Japanese paraphrases, distinct certificate and cookie-flag concepts, different
  code examples/languages, legacy requests, stable retries, payload byte limits,
  storage failures, intended reviews, and late pool/Gemini response ordering.
- Playwright MCP verified the seen-pool exclusion against the real disposable
  preview backend with isolated Gemini responses. Both reported rewordings were
  filtered from the fresh five-question batch. Replay values matched, and the UI
  sent seen IDs and showed one HTTPS-confidentiality card without horizontal overflow.
- No migration is required. Existing question/attempt data is not rewritten.
  The normal backend/frontend are restored after disposable preview cleanup.
- This is conservative local close-paraphrase detection. Semantically equivalent
  questions with substantially different wording can require stronger future
  semantic matching. Live-provider quality/device behavior are separate checks.

## Concept-level novelty, daily Practice reviews, and hardening — 2026-11-08

### Similar questions

- Questions carry an optional `concept`: a lowercase English kebab-case key for the single
  idea tested (for example `https-encryption`). Gemini supplies it for generated questions,
  the community reviewer supplies it for approved posts, and `npm run pool:concepts` labels
  the committed pool (179 questions; 76 concepts per language, 144 distinct overall). Migration `QuestionConcepts1794300000000`
  adds the column with a format check.
- Novelty hints include the concept. Two questions with the same concept count as a repeat
  regardless of wording, code, or format; wording overlap remains the fallback for rows
  without a concept. The frontend's final check matches.
- The novelty context now includes what the learner answered in the last 60 days on any
  device and what recent feed batches served them, in addition to the session's seen IDs
  and their recent Gemini questions. Gemini receives `recentConcepts` and must not reuse them.

### Daily Practice reviews

- A miss (tap or explanation below 8) keeps the question in Practice and schedules it for the
  next 09:00 Asia/Tokyo. Practice questions can be retried at any time; a correct answer
  clears them. Due questions are inserted into feed batches and pool responses (three per
  response); serving one moves it to the next 09:00, so a skipped question returns once a day.
- Question responses mark Practice items for the viewer (`review`), so opening one from the
  Practice tab or a link shows it unanswered. The feed tracks reviews apart from seen cards,
  so a morning review of a card seen the night before still appears.

### White-box penetration test

- Probed answer secrecy, authentication, Origin/CSRF, CORS, token forgery (`alg: none`),
  validation, ownership checks, concurrency of XP awards, rate limits, and headers.
- Fixed: every read endpoint is now rate limited (120/min per learner or IP); JSON bodies with
  `__proto__`, `constructor`, or `prototype` keys are rejected; `X-Powered-By` is removed and
  baseline security headers are set; `TRUST_PROXY` enables correct client IPs behind a load
  balancer; formatted code is cached so public lists do not re-run Prettier per request;
  explanation and correction comments are hidden as spoilers until the viewer answers;
  the guest pool exclusion list is capped to keep URLs short; two migrations that shared a
  timestamp are now ordered.
- Accepted risk: a tap reveals the correct option, including for logged-out callers, because
  shared links must work for guests. Tap XP is small (5); explanation XP requires Gemini grading.

### Verified results

- Backend: 212 unit tests and 47 integration tests on disposable PostgreSQL passed.
- Frontend: production build (278 kB initial) and 174 unit tests passed.
- Playwright: learning, variety, and social suites (10 tests × mobile/desktop) passed on port
  4300; auth suite 16 passed, with the 10 Google sign-in runs requiring port 4200.
- The probe script against the dev API: 34 of 35 checks pass; the remaining one is the
  accepted risk above. The pool was relabelled with live Gemini.

## Single-origin container, release job, probes, and CI — 2026-11-08

### Requirements

- One container serves the Angular build and the API from the same origin. The session cookie is
  `SameSite=Lax` and the app calls a relative `/api`, so a second hostname would break sign-in.
  `FRONTEND_DIST` points at the build; unset keeps today's API-only behaviour for local development;
  a path without `index.html` stops startup instead of serving 404s.
- Static serving: content-hashed top-level files (`main-XXXXXXXX.js`) are `immutable` for a year;
  everything else revalidates. Only a `GET`/`HEAD` that accepts HTML, is outside `/api`, and names no
  file returns `index.html`, so a missing script, an unknown `/api` path, or a non-navigation request
  stays a 404. The API's security headers apply to the shell as well.
- Probes: `GET /api/v1/health` (process only) and `GET /api/v1/health/ready` (`SELECT 1`, shared
  across concurrent callers, cached 2 s, 2 s timeout, `503` with a fixed body on failure). Both are
  public and unthrottled and reveal no configuration or error text.
- Database TLS: `DB_SSL=off|verify|no-verify` (default `off`), CA from `DB_SSL_CA` or
  `DB_SSL_CA_FILE`. Unknown values throw so a typo cannot silently connect in plaintext.
  `datasource.ts` no longer hard-codes `ssl: false`.
- Release job: `backend/scripts/release.ts` (`npm run release`, compiled to
  `dist/scripts/release.js`) runs pending migrations in one transaction and loads the question
  pool, from compiled output with no ts-node. Both steps are repeatable. It requires `DB_URL`.
- `main.ts` enables Nest shutdown hooks so `SIGTERM` closes the server and database pool.
- `Dockerfile` (repo root, four stages on `node:24-slim`): Angular production build, production
  dependencies, `nest build` (it rewrites the `src/...` imports that plain `tsc` leaves broken),
  runtime as the unprivileged `node` user on port 8080 with `NODE_ENV=production`.
  `.dockerignore` keeps `.env*`, keys, `node_modules`, `dist`, and the e2e/docs folders out of the context.
- CI (`.github/workflows/ci.yml`): backend (type-check, unit tests, build, `npm audit
  --omit=dev --audit-level=high`), frontend (unit tests, production build, audit), backend
  integration on a disposable PostgreSQL, Playwright (including the Google sign-in tests, which need a
  free port 4200), and the container image (build, then `e2e/scripts/container-smoke.sh`).
- `multer` (two high advisories, transitive through `@nestjs/platform-express`) is pinned to 2.5.0
  with an npm `overrides` entry, because every `@nestjs/platform-express` 11.x release pins 2.4.0
  and `npm audit fix` cannot change that. No upload route exists, so the code is not reachable
  today. Remove the override when moving to Nest 12.
- Operator documentation: `docs/deployment.md` (variables, release job, probes, Cloud Run outline,
  known gaps). `backend/.env.example` lists the new variables.

### Verified results

- Backend: 251 unit tests pass (39 new: TLS settings, probes, static serving), `tsc --noEmit` is
  clean, and ESLint/Prettier are clean on the new files. 47 integration tests pass on disposable
  PostgreSQL. Frontend: 174 tests pass, production build 277.93 kB initial, `npm audit` clean.
  `npm audit --omit=dev --audit-level=high` is clean in backend, frontend, and e2e.
- Playwright learning, variety, and social suites: 20 passed on port 4300 after the changes.
- Compiled-output check (a copy of the backend built with `npm run build`, against a disposable
  TLS-only PostgreSQL): `DB_SSL` unset is refused by the server; `verify` without the CA fails;
  `verify` with `DB_SSL_CA_FILE` and with a single-line `DB_SSL_CA` connect; `no-verify` connects;
  `DB_SSL=require` fails closed; a missing `DB_URL` is reported; a second release run applies nothing
  and seeds 0; a Cloud SQL style `?host=<socket dir>` URL connects. The server then started from
  `dist`, served the Angular build, and `e2e/scripts/smoke-http.sh` passed 23 of 23 (probes,
  shell and deep links, cache headers, 404 behaviour, headers incl. HSTS, seeded pool for guests,
  same-origin sign-up with an HttpOnly/Secure/SameSite=Lax cookie, profile and progress reads,
  foreign `Origin` refused, guests refused on private routes). `SIGTERM` exits the process, and a wrong
  `FRONTEND_DIST` aborts startup with a clear message.

### Not verified

- The Docker image build and `e2e/scripts/container-smoke.sh`: Docker (Colima) was not running and
  was not started. The workflow YAML parses, but it has not run on GitHub; the `browser` and `image`
  jobs are the least certain. The Dockerfile's assumption that `argon2` needs no compiler on
  `node:24-slim` rests on its bundled linux x64/arm64 prebuilds.
- Cloud Build, Cloud Run, Cloud SQL (socket or TLS against a managed database).
- Google sign-in on a deployed origin: the frontend still allowlists only `http://localhost:4200`.

## Capacitor mobile apps (iOS and Android) — 2026-11-08

### Requirements

- The product is mobile-first, so the Angular app ships inside a Capacitor 8 shell (`frontend/ios`,
  `frontend/android`, `frontend/capacitor.config.ts`). The shell bundles its files and loads them from
  `capacitor://localhost` (iOS) or `https://localhost` (Android); loading the deployed site instead was
  rejected (no offline start, and store review rejects thin website wrappers).
- The bundle bakes in the API origin: `npm run native:build` (`WHYLINT_API_URL`, https only) and
  `native:build:dev` (http allowed, default `http://localhost:3000`) build `ng build --configuration
  production,native` or `development,native` into `dist/native`, with `--define __API_BASE_URL__`, then
  run `cap sync`. Web builds are unchanged and still use the relative `/api`.
- Session: a SameSite cookie does not follow the shell's cross-origin requests, so a request whose
  `Origin` is listed in the new `NATIVE_APP_ORIGINS` (default empty; invalid entries stop startup) gets
  `{ message, token }` and no cookie from sign-up, password login and Google login. Every other
  origin, including the web origin, still gets only the HttpOnly cookie. `AuthOriginGuard` and CORS
  accept the web origin plus the listed native origins; nothing is trusted without a valid
  `FRONTEND_URL`. The backend already accepted `Authorization: Bearer`.
- The app keeps the token in the iOS Keychain / Android Keystore (`@aparajita/capacitor-secure-storage`,
  this-device-only, no iCloud sync), attaches it to relative `/api` calls only, stores the token a
  sign-in returns before the caller sees the response, and forgets it on logout or on a 401 for that
  token (unless a newer sign-in replaced it). A failing keystore falls back to memory. A Capacitor plugin is
  a Proxy that answers `then`, so it is never the value of a promise (this broke storage until a test
  against the real plugin exposed it).
- Shell behaviour (`src/app/native`): detection through the injected `window.Capacitor` (the web bundle
  does not import `@capacitor/core`; plugins load on demand), status bar style that follows
  `data-theme` from every screen, a page-colour strip behind the status bar, Android back button
  (open sheet, then history, then exit), haptics, the share sheet, and share links that use the
  deployed origin.
- Google sign-in is not available in the app (the existing "coming soon" message): Google rejects
  OAuth in embedded web views. Password sign-in works.
- CI builds the native bundle in the frontend job, the Android debug app on Linux, and the iOS
  simulator app on macOS (skipped for pull requests). `docs/mobile.md` is the operator and developer guide.

### Verified results

- Backend: 277 unit tests (26 new), 48 integration tests on disposable PostgreSQL (one new: token in
  the body only for listed origins, cookie for the web origin, unlisted origins refused, logout revokes).
- Frontend: 233 unit tests (59 new). Web production bundle 281.92 kB initial (277.93 before);
  the native production bundle is 281.89 kB with the API address baked in.
- Playwright on port 4300: learning, variety, social and the new native-shell suite, 24 passed. The
  native-shell tests serve the native build from its own origin and check cross-origin sign-up (Bearer
  token, no cookie, `Access-Control-Allow-Origin`), reload, a graded answer and logout. Auth: 16 passed;
  the 10 Google runs still need port 4200. The stack runner now starts the native stand-in first so the
  web port answers last (Playwright starts as soon as it does).
- iOS Simulator (iPhone 16 Pro Max, iOS 26.5, Xcode 27.2), against the disposable stack: builds with all
  seven plugins; feed loads from the API across origins; a bug-of-the-day answer is graded; sign-up and
  password login work; the session survives killing and relaunching the app and is gone after logout;
  the unreachable-API state recovers on retry; the status bar is readable in both themes (a bug found
  and fixed: screens that switch the theme themselves left dark text on a dark page) and no longer
  runs through a scrolled page.
- Found and fixed along the way: the Keychain write fails with `-34018` in a build made with
  `CODE_SIGNING_ALLOWED=NO` (no entitlements), so the session was lost on restart; run signed builds
  (documented) and the keystore step that fails is now logged. The `multer` override from the
  deployment work is unaffected.

### Android verification (JDK 21 installed with Homebrew)

- `openjdk@21` (keg-only, 21.0.13) was installed with Homebrew at the user's request; PATH and the
  system Java wrappers were not changed (`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
  is set per command). `./gradlew assembleDebug` succeeds: a 5.8 MB debug APK, package
  `app.whylint.mobile`, compile and target SDK 36.
- A headless AVD, `whylint_api37` (Pixel 8 profile, the installed arm64 Android 37 Google Play image),
  was written by hand under `~/.android/avd` because `avdmanager` is not installed. It boots in about
  15 s; the app reached the throwaway backend through `adb reverse tcp:3101 tcp:3101` and cleartext
  http (`WHYLINT_NATIVE_DEV=1`).
- Verified on it: first launch and onboarding; feed loaded across origins; a bug-of-the-day answer
  graded; sign-up with the soft keyboard (the page resizes and keeps the focused field and the submit
  button visible); the session survives `am force-stop` and a relaunch (Android Keystore) and is gone
  after logout; edge-to-edge layout (header and bottom bar clear the system bars); the Back button
  closes the comments sheet first and leaves the app on the next press.
- Bugs found and fixed there: (1) a race in the status bar style. Capacitor does not guarantee that
  native plugin calls land in order, so an early "dark" call could override the later "light" one on
  a cold start (about one start in four). Updates are now applied one at a time and always end on the
  latest theme (unit tested; 8 of 8 cold starts correct afterwards). (2) A history trap: the onboarding
  screen stayed in history after sending the learner to the feed, so Back from the feed needed an extra
  press through a redirect. Onboarding now replaces its entry (`replaceUrl`), which also fixes the
  browser Back button.
- iOS was rebuilt and smoke-tested again after those two changes.

### Not verified

- Physical devices of either platform, the share sheet, the feel of the haptics, Back from routes other
  than the feed and the comments sheet, Android on an API level below 37, and the CI Android and iOS
  jobs on GitHub.
- The app id `app.whylint.mobile` is a placeholder; signing, icons, store assets, universal links,
  push reminders and native Google sign-in are open (see `docs/mobile.md`).

## Mobile audit implementation — 2026-11-08

Implement the ten findings in docs/mobile-ui-ux-audit-2026-11-08.md, preserving the
current branch, uncommitted work, Japanese/English, themes, and existing learning,
auth, social, review, and XP behavior. No Git commands are authorized.

### Mobile learning surface

- Keep the first stage focused on the question, code/choices, immediate feedback,
  Next, and a compact social row. Use a single daily marker and compact subject/
  level metadata. Preserve access to the complete original question/provenance.
- Mobile deeper learning, tutor, references, reporting and shared-explanation
  editing use deliberate detail surfaces. Keep existing actions/labels findable
  and functional through their normal entry points. Desktop centered question
  and action rail remain supported. Avoid nested vertical scrolling inside cards.
- Make oversized cards readable through natural mobile scrolling/proximity snap.
  Typical short beginner tasks should fit the learning area. Long code/questions
  and larger text remain reachable. Preserve code line numbers and selection.
- Retain the selected answer on a failed tap and expose Retry answer for that exact
  choice. Use operation-specific connection/401/validation messages and sign-in
  recovery. A failure does not create a wrong grade. Repeated taps stay guarded.
- Interactive code rows and secondary actions have at least 48px touch targets.

### Native accessibility and navigation

- Offer persisted Standard/Large/Larger reading-size settings through Profile.
  Use --reading-scale on the root (1/1.15/1.3) and scalable rem-based reading text
  on learning, comments and related settings. Keep inputs at least16px and layout
  usable at larger size. Enable supported native pinch zoom as an additional path.
- Apply safe-area left/right padding inside fixed discussion/detail overlays and
  safe-top protection for expanded native drawers. Preserve bottom keyboard/home
  indicator padding, focus, dismissal, and native Back behavior.
- Replace low-contrast hot-combo treatment with an accessible token-based palette.
- A guest choosing Explain why carries a validated local returnTo destination
  `/questions/<uuid>?explain=1` through password/signup and web Google flows.
  SharedQuestion passes explainOnOpen to QuestionCard to reopen that task once
  authenticated. Reject external/ambiguous return targets and preserve normal
  auth/onboarding redirects for callers without an intent.

### Installed native app and data alignment

- Build/sync a development native bundle for localhost3000 and configure exactly
  the two local native origins on the dev backend using the user's authorized
  native-setup fix. Preserve other environment values without printing them.
  Restart only the verified backend process when required for startup CORS config.
- Keep production HTTPS validation and the placeholder app identity until the user
  chooses the real identity. Native bridge logging is explicitly disabled before
  running token-bearing builds. A401 for a caller-supplied Authorization header
  must not clear a different stored session token.
- Rebuild/install a signed iOS Simulator build using existing signing settings and
  verify the installed API target. Reuse JDK21 per command if Android verification
  is available. Never read/print actual tokens or use real OAuth/Gemini credentials.
- The current SQL seed already contains the intended WHER typo. Align the installed
  app to the current dev API and add a curated fixture regression for that content.
  Preserve historical attempt meaning. A future repair of answered seed lessons
  requires explicit versioned-content handling, not silent rewrites.

### Verification

Run current builds/unit suites, disposable PostgreSQL integration, and browser
flows using isolated external responses. Add regression coverage for compact
mobile layout, detail actions, retry selection, reading size, safe insets, auth
return intent, and native config/header handling. Explore320/390/430, landscape,
Japanese/English and both themes. Capture signed native Simulator evidence when
possible, distinguish browser/native/physical-device proof, repeat independent
source/visual review, and update the audit findings with verified resolution status.

### Verified results — mobile audit implementation

- Backend unit tests passed 278 across 23 suites. Frontend unit tests passed 269
  across 27 suites. All 48 disposable PostgreSQL integration tests and all 56
  mobile/desktop browser tests passed, including Google fixtures. Typecheck and
  web/backend production builds passed. Initial web bundle is 283.71 kB.
- The SQL fixture regression checks the intentional WHER typo and line-3 answer.
- At 390px, the compact shared-layout SQL card measured 533.5px inside a 699px
  learning area, with 48px answer rows. Its references were available through
  Question details. Failure retained the chosen row and exposed Retry answer.
- Larger reading size produced a 20.8px root. At 320/390/430px and 844x390, no
  horizontal overflow was observed. At 320px the navigation grew to 91px and left
  546px for learning content. Long/larger cards use natural mobile scrolling.
- The configured dev backend now permits the two local native origins. Other
  parsed environment settings were preserved, and the verified watcher was
  restarted to load CORS. Signed iOS and Android debug artifacts now target
  localhost:3000, have bridge logging disabled, and enable native zoom.
- The signed iPhone 16 Pro Max Simulator app was installed, launched and captured
  against the normal dev API. The rebuilt Android debug APK (5,918,900 bytes) was
  installed and launched on the owned API37 headless emulator with adb reverse.
  Both portrait captures show the full compact task and clear system-bar areas.
- End-to-end tests use isolated synthetic client actors in the disposable harness.
  A quota regression confirms repeated submissions still hit the normal signup
  quota and an independent actor has separate accounting. Production guards and
  quotas are unchanged. The helper awaits card rendering before opening details.
- Independent source and visual reviews returned a ship verdict for the scoped
  fixes. Evidence is in frontend/.impeccable/review/mobile-fixes-2026-11-08/.
- Physical devices, VoiceOver/TalkBack, native text-size gestures, detailed IME/
  landscape behavior, and additional Android versions require follow-up checks.
# Cloud Run web Google sign-in — 2026-11-08

- Allow Google sign-in and callback on the existing localhost origin and the deployed
  WhyLint Cloud Run origin. Keep other origins and native webview sign-in blocked.
- Use the existing OAuth state handling, callback, and server-side session flow.
- Verify the deployed origin starts the flow with its exact callback, while existing
  local, native, and unconfigured-origin checks continue to pass.
- Cloud Run needs its matching Google OAuth client ID and client secret. Register the
  deployed callback with Google and verify a real login separately after deployment.

