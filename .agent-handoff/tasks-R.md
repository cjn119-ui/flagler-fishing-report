# Codex job R — fix both Opus reviews (UX + logic) on b307ce0

Repo /Users/christiannunez/flagler-fishing-ios, branch feature/capacitor-ios, HEAD b307ce0. Start: `pwd; git rev-parse --show-toplevel; git status --short`. Do not commit. Do not invoke Claude.
PARALLEL JOB B (native map + notifications) is running at the same time and OWNS: ios/** (incl. ios/bridge.js, ios/bridge.css, ios/App), capacitor.config.json, package.json/package-lock.json. You must NOT edit those. You own: site/v5/proto/**, site/v5/spots.js (closures only), scripts/build-ios-web.mjs, scripts/ux-ios.mjs, scripts/test-*.mjs. Do NOT run npm run ios:sync, xcodebuild, or the simulator (Job B does native builds); browser tests only.
Contract with Job B (already in redesign.md): window.FFNativeMap {show, hide}, `ffmap:select` event, window.FFNotify {sync}. When FFNativeMap is absent, the Spots map slot must show neutral copy, never "available in the iOS app".
Live-data testing: copy https://cjn119-ui.github.io/flagler-fishing-report/api/v5/{today,tomorrow}.json into a scratch ios-www/api/v5 and use UX_LIVE=1 (Node static server).

## P0
1. Today: `#verdict { margin:-34px … }` (proto.css ~913) covers the hero conditions strip (`bottom:8px`, ~910) — only 2 of 4 cells visible. All cells + labels must be visible; keep the compact layout.
2. Plan hourly table: Outlook column clipped ("Outlc", "Grea"), Conditions text collides. table-layout fixed, sky as a small icon, wrap conditions, no overflow at 320/375/393.
## P1 — correctness
3. Closed pier via species focus (CONFIRMED live: scopeViews.bySpecies.sheepshead.focused = staug-pier:pier): treat `focused` as missing when isModeClosed(locationId, mode) in ctx() (proto.js ~156), openSpecies (~1183–1194, filter cands with openModeRows, disable "Target this" for closed), species tiles (~815).
4. Closed modes through the Mode control: renderCtl (~388) must offer only open modes; readHash (~181), saved spot, ffmap:select (~1290) must coerce a closed st.mode to an open one; Spots feature card (~781) must not read byLocation[...:pier] for a closed mode (use bestModeRec).
5. Observation shapes: shared `fmtWind()` everywhere (proto.js 802, 853, 896 append " mph" to "18 mph"); `observationRows` (~868) must also read single-value observations (`values.waveHeightM`, `values.temperatureC` → °F); select waveForecast/hourly rows by the period covering NOW (Today) or the SELECTED day/hour (Plan), not `.find()` first row (678, 795, 851, 916); Plan summary must follow the selected day chip (906–917); hero "Air" must be the current hour, not the first row of the day (671).
6. Hourly outlook words: below 50 is "Poor" (reuse speciesFitBand thresholds, muted colour, not red); hours outside any window say "Outside window" instead of a fit word like "Great".
7. Today verdict with an ended window: when the best window has ended, lead with the next window ("Next: Tomorrow 7:30 AM"), past GO as a secondary line.
8. Swipe commit snap-back (proto.js ~1395–1406): animate view + neighbour preview to ±innerWidth then swap with no extra cross-fade; keep `--tab-i` at the target until after render so the tab indicator never jumps back. Build neighbour previews on touchstart/idle, not inside touchmove (~1389).
9. Periodic re-render (setInterval render 60 s ~1373 + refreshes) resets open <details>, carousel scroll and selected hour: only re-render when data or the clock-dependent text changes; preserve details open state, horizontal scroll positions and scroll position.
10. Closed-pier rows: one badge next to the title "Closed · est. reopen Jan 2027" / "Closed · repairs to ~end Nov 2026"; photo caption only in the detail sheet; no orphan caption without image; no title truncation to "St. Augustine Beac…".
11. Blank image boxes: first ~6 images eager, rest lazy with explicit width/height and the designed gradient placeholder background.
12. Map slot copy (see contract above).
## P2
13. Plan daily outlook tiles truncated → 4-column grid with icons (concept), values for the selected day.
14. Tide chart: top labels clipped and curve clipped at left — pad the viewBox; keep times in the row below.
15. Species: fish art cropped (`.species-thumb object-fit:cover` ~810) → contain + padding; remove the outer card wrapper around the species tab; reason chips sentence case, not letter-spaced pill; one-line legend.
16. Spots: chips + search first, then featured spot; single search control (field only, also on Species); list rows thumbnail-left layout.
17. Light theme: active tab + segment indicator nearly invisible → accent-tinted indicator (~14%) in Light.
18. `.quiet .t-num { opacity:.6 }` contrast ~3.3:1 → remove opacity, use muted colour.
19. Sheet close: slide only (no opacity fade), ~280 ms cubic-bezier(.32,.72,0,1); remove the duplicate CSS scrim animation.
20. iOS feel: `-webkit-touch-callout:none; user-select:none` on UI chrome, cards, images (keep text selectable in inputs and long text where useful).
21. Header fallback-vs-stale (proto.js 349–353): stale must win (or show both).
22. Catch context uses c.run (follows Today/Tomorrow) → always the run whose targetDate matches the catch day (D[RICH] for today).
23. shareReport: when location.protocol is "capacitor:" share the Pages URL, never capacitor://localhost.
24. Offline cache on iOS can exceed the WebKit 5 MB localStorage quota (runs are 3.3–3.4 M chars). In proto-data.js cache a trimmed run that still renders all screens offline (measure; target < 1.5 MB per run), and mark data served from cache as `source:"cached"` with an honest label. (Job B will pass an `x-flagler-ios-cache` header from the bridge; honour it when present.)
## P3
25. Hourly/day 3–7: collapse five identical "Promising · Morning" rows or add a per-day tide/moon cue.
26. Log empty state: hide the top "Log a catch" when the list is empty.
27. Header: match the "···" button to the round refresh button; move "Updated …" into the header row to save vertical space.
28. Bet row: keep "7:30 AM" together; target names not truncated ("Mangrove sn…").
29. Best-times readout: hide factors with no value ("Light —").
30. Hero image by mode/spot (inshore spot ≠ surf angler; use the spot photo or a mode-appropriate image).
31. CSV export: prefix cells starting with = + - @ or tab with '. loadCatches: drop rows with invalid occurredAt. Catch times: parse and display in America/New_York consistently.
32. build-ios-web.mjs: exclude site/v5/proto/shots/, NOTES.md, unused hero-licensed.jpg, fish/ref/ from the native bundle.
## Tests (no faked results)
Add tests for: species focus with a closed pier; Mode control/hash/saved spot with a closed mode; observation shapes (rows vs values.*, "mph" strings, °C); cache size; CSV injection; corrupt catch rows; catch context run selection; hourly outlook words. All suites + ux-ios (sample, twice) + ux-ios UX_LIVE=1 pass. Screenshots (live) every tab × 3 themes → .agent-handoff/shots/r/. Report in codex-results-R.md with commands and exit codes.
