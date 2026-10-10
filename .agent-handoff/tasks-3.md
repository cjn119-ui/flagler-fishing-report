# Codex task 3 — liquid-smooth motion, night palette, visual appeal

Repo /Users/christiannunez/flagler-fishing-ios, branch feature/capacitor-ios. Start: `pwd; git rev-parse --show-toplevel; git status --short; git log --oneline -1`.
Builds on task 2 (already committed). Same editable/protected file rules as tasks-2.md. Do not commit. Do not invoke Claude.
Owner feedback: animations "skip", closing a sheet with ✕ sometimes jumps, Night theme "much too dark", wants interactions "very liquid smooth and seamless" and the design "visually appealing and enticing".

## 1. Sheet close skip (confirmed root cause)
`closeSheet()` in site/v5/proto/proto.js adds `.out` then synchronously calls `getAnimations()`; WebKit can return [] before style recalc, so the sheet is removed with no exit animation.
Fix: drive open/close with the Web Animations API (`el.animate`) from the element's current computed transform (handles mid-drag and mid-open), await `animation.finished`, with a timeout fallback (duration + 80 ms). Closing during an opening animation reverses smoothly. Scrim fades in lockstep. Drag-to-dismiss: velocity-aware (flick > 0.5 px/ms or > 30% height dismisses), otherwise spring back. Never re-render #view while a sheet animates out.

## 2. Rendering cost (WebKit jank)
- proto.css (~line 422) applies backdrop-filter blur to .card, .seg, .pill, .mark, buttons, banners etc. Keep backdrop-filter ONLY on: header .bar, .tabbar, .sheet (and .sheet-f), .toast. Give cards/controls near-opaque fills (color-mix ~94–97% surface) that look the same.
- Animate only transform and opacity. Remove box-shadow/background transitions (ios/bridge.css depth layer has `transition: transform, box-shadow` — drop box-shadow).
- `will-change: transform` only during active gestures/transitions, removed after.
- Restore per-tab scroll position before the first frame of the new tab (no visible jump).

## 3. Tab navigation
- Tap a tab: View Transitions API when available (`document.startViewTransition`), directional slide by tab index (new tab enters from the side it lives on, ~300 ms, ease cubic-bezier(.32,.72,0,1)), header/tabbar excluded from the transition (`view-transition-name` on #view only). Fallback: same slide via WAAPI. Reduced motion: crossfade 120 ms.
- Swipe: finger-following 1:1 with the adjacent tab's content peeking in (render the neighbour lazily on gesture start), rubber-band at first/last tab, release settles with the same spring curve; velocity flick commits. No double render at the end of a swipe.
- Tabbar: active indicator pill slides between tabs (shared element), icon gets a subtle 1.0→1.08→1.0 pop on selection.
- Owner requirement: the user must be able to slide between all 5 bottom pages (Today, Spots, Species, Plan, Log). Both gestures must work: (a) swiping the page content left/right, and (b) dragging a finger along the tabbar — the indicator pill follows the finger, a light haptic ticks at each tab boundary, and the tab under the finger commits on release (iOS Liquid Glass tab-bar style). Verify both in scripts/ux-ios.mjs across all 5 tabs in both directions.

## 4. Night palette (replace current values in proto.css `:root[data-night="1"]`)
bg #000000; surface #14181D; surface-2 #1C2127; line rgba(255,255,255,.12); line-strong rgba(255,255,255,.18); text #EEF2F5; muted #A9B4BE; accent #5CC8E8; go #34D399; mid #FBBF24; skip #F87171; none #64748B. Restore a faint background glow (vignette accent at ~40% of dark-theme strength). In ios/bridge.css night depth vars: --depth-edge top highlight rgba(255,255,255,.12). Night must read clearly blacker than Dark but equally legible.

## 5. Visual appeal (concrete, keep the existing design language — no new framework)
- Verdict hero: Go/Maybe/Skip seal gets a gentle entrance (scale .94→1 + fade, 260 ms) and a soft coloured glow matching the verdict; reduced motion: none.
- Press states on every tappable surface (cards, rows, chips, tabs, buttons): scale .97 + slight brightness, 90 ms in / 180 ms spring out; haptic already wired.
- Numbers (scores, fits, counts) count up briefly on first view (≤400 ms), not on every re-render.
- Suitability bars fill from 0 on first appearance (transform: scaleX, origin left).
- Log tab: an inviting empty state (simple inline SVG illustration of a fish/line in the accent colour + "Log your first catch" CTA); success toast after saving with a check micro-animation.
- Consistent rhythm: 16 px gutters, 12/16/24 spacing scale, card radius 22, section titles same size/weight across all tabs.
- Pull-to-refresh: smooth rubber-band with a spinner that fills with progress, then releases.
- Everything must respect prefers-reduced-motion.

## 6. Verification (no faked results)
- All existing suites + scripts/test-v5-catch-log.mjs + scripts/ux-ios.mjs pass.
- Extend scripts/ux-ios.mjs: (a) sheet close via ✕ 20 times in a row — assert the exit animation ran each time (sheet still in DOM ≥150 ms after click, removed by 600 ms); (b) close during open; (c) performance trace (Playwright/CDP or `requestAnimationFrame` frame-time sampling in page) during 5 tab switches, 5 swipes and 5 sheet open/close cycles — report p95 frame time and count of frames > 25 ms; (d) screenshots every tab × 3 themes at 375 px to .agent-handoff/shots/ux3/.
- Native: npm run ios:sync, xcodebuild for simulator A488F352-DB47-40AE-8C25-D256D90FB728, install (do NOT uninstall the app — keep user data), launch, screenshot to .agent-handoff/shots/ux3/native-today.png.
Append a concise report to .agent-handoff/codex-results.md (commands, exit codes, frame-time numbers before/after, anything not done).

## 7. Species page: greyed cards are mislabelled (Claude diagnosis, live data 2026-10-10)
Presentation-only fixes in site/v5/proto (do NOT change engine files or params; eligibility/floor/catalog are owner decisions).
- Card number = suitability (conditions fit 0–100), not catch chance. Greyed = representative candidate's eligibility ≠ "realistic".
- Bug A: `speciesRows()` picks the highest-suitability candidate regardless of eligibility. Pick the best **realistic** candidate first; fall back to best overall only when none is realistic. (e.g. sheepshead: realistic 20 at staug-pier/pier is shown greyed from a no-structure candidate.)
- Bug B: engine run.js maps every non-realistic eligibility to band "Rare here". In the proto, label by `eligibility`/`eligibilityReason.code` instead: belowRealisticFloor → "Rarely caught" + trip rate; historyUnavailable → "No survey data"; off-list → "Not on our spot lists"; no-structure → "Needs structure"; bycatch → existing Bycatch tag. Keep the fit word (Great/Decent/Poor/Not a fit) visible for every card so a greyed 76 still reads "Great conditions fit".
- Show the historical trip rate when available: e.g. "Caught on ~15% of Oct trips" (historicalRate.rate, month, lowSample → "small sample").
- Card subtitle: replace "Suitability, best first" with "Realistic targets first · ranked by today's conditions fit". Add a one-line legend explaining greyed cards.
- Detail sheet (openSpecies) must state the same reason text.
- Tests: extend scripts/ux-ios.mjs or a node test with a fixture where a species has realistic + off-list candidates and assert the realistic one is shown, and that off-list never says "Rare".
