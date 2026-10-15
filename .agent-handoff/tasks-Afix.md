# Codex job A-fix — Claude review findings on 8b333ca + pier closures

Repo /Users/christiannunez/flagler-fishing-ios, branch feature/capacitor-ios, HEAD 8b333ca. Start: `pwd; git rev-parse --show-toplevel; git status --short`. Do not commit; do not invoke Claude; do not uninstall the app.
ALSO implement `.agent-handoff/tasks-closures.md` in full (owner authorized catalog + engine edits for closures only; that file lists the evidence).
Review was done with LIVE data (copy https://cjn119-ui.github.io/flagler-fishing-report/api/v5/{today,tomorrow}.json into a scratch copy of ios-www/api/v5/ and serve with a Node static server — python http.server resets on the 3 MB files). Add this live-data mode to scripts/ux-ios.mjs as an opt-in (`UX_LIVE=1`), keep the deterministic sample mode default.

## P1
1. Primary `.btn` labels are invisible (text colour ≈ button colour) in all themes: "Log a catch", "Log your first catch", Spots "View details". Fix and add a contrast assertion (≥ 4.5:1) for every `.btn` in ux-ios.
2. Plan "Hourly fishing forecast" shows only Time + Sky. Spec requires Conditions (e.g. "S 13 mph · 2–3 ft") and Outlook (fit word coloured, from run slots for that spot/hour; "—" outside data). Long sky text ("Slight Chance Showers And Thunderstorms") is clipped — wrap or shorten (e.g. map to "Chance of storms").
3. Pier closures — tasks-closures.md. Live data today shows "Flagler Beach Pier · Pier · 7–9:30 AM · Whiting 71" in the GO list: a closed pier recommended.
4. ux-ios sheet-exit assertion is flaky (Claude's run: "sheet must remain in DOM during its exit animation 0 !== 1" under load). Measure in-page instead: record `performance.now()` at the ✕ click and at removal via MutationObserver on #sheet-root; assert removal ≥ 170 ms and ≤ 600 ms for 20 closes. Also audit every path that closes a sheet silently/instantly (e.g. `hashchange` → `closeSheet(true)`, tab change, swipe) so a user ✕/scrim/drag close always animates.

## P2
5. Plan "Daily outlook" copy is generic ("Today's forecast conditions and safety gates determine this day."). Use the day's real content: verdict + best window + top species + the main factor(s) from the run (e.g. "GO · 7–8 AM at Flagler Beach ICW · mangrove snapper. Light wind and a rising tide."). No invented claims.
6. Truncated stat tiles: Plan conditions ("Partly …", "S 13 …") and spot card stats ("S 13 mp…"). Use a 2×2 grid with full values (smaller unit text, 2-line labels allowed); show every available value (air temp + sky, wind, waves ft, water °F) and hide missing ones without leaving gaps.
7. Tide chart uses straight segments. Draw a smooth curve (cosine interpolation between consecutive high/low points), gradient fill under the curve, a "now" marker on today, H/L markers with time + height (concept style).
8. Many image slots render as empty boxes in full-page captures (spot rows, several species cards) although the files exist. Check lazy loading/decoding; images must appear when scrolled into view, and the placeholder must be the designed gradient (never an empty box). Verify with a scrolled capture.
9. Web (no FFNativeMap): the map slot is a ~290 px empty "Explore nearby spots" card. Collapse to a compact header on web; keep the full slot only when FFNativeMap exists.
10. scripts/build-ios-web.mjs: exclude `img/fish/ref/` (reference-only stock, 1.3 MB) from the native bundle.

## P3
11. Today/Tomorrow segment appears on Log — hide it there (keep where it changes content).
12. Log stat labels wrap to 3 lines ("CATCHES THIS MONTH") — shorter labels ("This month", "Top species", "Best spot").
13. Stacked stale/sample banners push the Today hero far down — keep the honest wording but make repeated notices compact (one banner, details on tap).

## Verify (no faked results)
All suites (pages.yml list, scripts/test-v5-*.mjs, test-ios-bridge, test-v5-catch-log, new closure tests) + ux-ios (sample mode) pass twice in a row; ux-ios UX_LIVE=1 passes once. Screenshots (sample + live) for every tab × Dark/Night/Light at 375 into .agent-handoff/shots/afix/. Then ios:sync, xcodebuild for simulator A488F352-DB47-40AE-8C25-D256D90FB728, install, launch, native screenshot. Report in codex-results.md with commands and exit codes.

## OWNER ADDITIONS (2026-10-10) — same job, higher priority than P2/P3
A partial first attempt was cancelled; scripts/test-v5-species-presentation.mjs may exist from it — inspect and keep or finish it.

### O1. Today (landing page) is too spread out — make it compact
Keep every element from mesh-map.md reachable (disclosures are fine), but restructure:
- Above the fold at 375×812 (below header) must show: spot + date, verdict badge + headline, best window time + top species, and current conditions. Hero image shrinks to ~190–210 pt; the verdict ("Fishing outlook") card overlaps the hero's bottom edge (concept style); the conditions strip becomes one compact row inside/under the hero (temp+sky · wind · waves · water — no duplicate conditions grid further down; merge the old Conditions tiles into this row + "Why").
- Best bet folds into the verdict card as one row (mode chip · window · chevron).
- Targets → the concept's horizontal species row (image, name, fit word); tapping opens the existing species sheet; suitability bars move into that sheet.
- "Suitability = …" note, local history, Why, and Confidence collapse into one "Why this verdict" disclosure at the bottom of the verdict card.
- Best times chart: ~140 pt tall; the selected-hour detail becomes one inline line (time · fit · tide · light) instead of tiles; species-at-hour list only inside the disclosure.
- Today vs tomorrow → one compact row (two verdict chips + windows).
- Other spots → horizontal scroll of small cards (thumbnail, name, verdict, window), first 6 + "See all".
- Rhythm: 12 pt between cards, 16 pt card padding, no full-width empty space. Target: Today total height ≤ 2.3 screen heights at 375×812 with live data (assert in ux-ios UX_LIVE).
### O2. Bottom tab bar in the Today/Tomorrow segmented style
The owner likes the Today/Tomorrow control. Restyle the tab bar to the same language: inset pill track (same fill, border, inner shadow) with a raised sliding indicator pill (same fill, depth and radius as the segment's `.seg::before`), icon + label inside each slot, active label/icon colour the same as the active segment text. Keep it floating with safe-area spacing. Works in Dark/Night/Light.
### O3. Both must slide, smoothly
- Today/Tomorrow segment: indicator animates between options with the spring curve; it can also be dragged — the indicator follows the finger and snaps to the nearer option on release (commit changes the report day).
- Tab bar: indicator slides between tabs with the same spring on tap; follows the finger during a tab-bar drag (snap on release, haptic tick per boundary); AND tracks content-swipe progress in real time (indicator position interpolates with the page drag dx, then settles with the page).
- Only transform/opacity animated; no layout thrash; 60 fps target. ux-ios: tap, drag and content-swipe paths for both controls; frame-time sampling during them (report p95 and frames > 25 ms).
