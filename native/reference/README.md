# Web reference for the native apps

Captured from the current Angular checkout on 9 November 2026 at `http://localhost:4200` with an isolated Chromium context. Screens use public guest data from the existing local backend. No personal account was used. The browser screenshot files are visual references, not evidence that either native app rendered correctly.

The native implementations should preserve these content groups and the WhyLint design tokens. Platform safe areas and accessibility text scaling must remain usable. Native rendering, gestures, keyboard handling, and auth require their own evidence.

- Main phone viewport: 390 × 844 CSS pixels; dark and light samples are included.
- Narrow enlarged-settings viewport: 320 × 568, reading scale 1.3.
- UI: DM Sans; source code: DM Mono. Japanese glyphs use the OS fallback font.
- Dark: canvas `#080808`, surface `#151515`, text `#f5f5f2`, muted `#b4b4ac`, accent `#c6f24e`, border `#333333`, code `#090909`.
- Light: canvas `#f3f5f0`, surface `#ffffff`, text `#20251f`, muted `#555e53`, accent `#4b6c08`, border `#d2d9cf`, code `#f1f3ed`.
- Feed phone header: compact `w_` mark, learning status, account action. The wordmark appears on wider screens and auth/onboarding pages.
- Main navigation: Feed, Practice, Ranking, Post, Profile. The active item uses the accent color.
- The question card contains the complete question and answers/code, followed by social actions and Why?/Details. One feed card occupies the available vertical stage.
- Appearance is in **Profile → Settings → Appearance**. Dark and Light are explicit options, saved on the device and available to guests too. There is no header theme button on any route.

The screenshot set covers feed in both themes, guest profile/settings in both themes, enlarged settings, onboarding, login, signup, guest Practice/Post, and Ranking. Additional account feed, Profile, onboarding step two, and publication-form captures use a unique synthetic account on the disposable web/API stack at localhost:4330/3130. No production account or private user data was used. Answer feedback, comments, completed publication, and AI assessment are not proven by this screenshot set.

During the settings move, the guest sign-in label was corrected to the semantic button text color, and reading-size choices now wrap whole labels instead of clipping at narrow widths. The captures reflect these corrections.
