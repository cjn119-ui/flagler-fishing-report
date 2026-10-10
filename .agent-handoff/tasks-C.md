# Codex job C — cold start, map fit/placement, remaining polish

Repo /Users/christiannunez/flagler-fishing-ios, branch feature/capacitor-ios, HEAD 310097c. Start: `pwd; git rev-parse --show-toplevel; git status --short`. Do not commit; do not invoke Claude; do not uninstall the app. You own all files for this job (no parallel job).
IMPORTANT lesson from 310097c: browser tests do not execute the native bridge path; a relative-URL crash shipped. Every change must also be verified on the simulator (A488F352-DB47-40AE-8C25-D256D90FB728) after `npm run ios:sync` + xcodebuild + install + launch. Use the DEBUG launch hooks in SceneDelegate.swift (`--flagler-spots` etc.) and screenshots via `xcrun simctl io … screenshot`. Add a DEBUG-only hook that surfaces JS errors on screen or via NSLog (WKWebView console → NSLog) so native failures are diagnosable.

## 1. Cold start (P1)
Native launch shows "Opening current conditions…" for 25–40 s: two 3.4 MB runs are downloaded and processed before first render. Target: first meaningful content ≤ 2 s after launch on the simulator when a cached run exists, ≤ 6 s on first ever launch with network.
- Render immediately from the trimmed cached run (proto-data.js) with honest "Saved … · updating" labelling, then refresh in the background and re-render only if the data changed (preserve scroll/open state).
- Fetch today and tomorrow in parallel; render as soon as today arrives (tomorrow lazily).
- Measure where time goes (fetch vs JSON.parse vs ctx/render) with performance marks; report numbers. If a single render pass is slow, optimise it (memoise per-run derived structures like candidate indexes, spot rows, observation lookups).
- Never show sample data as live; first-ever offline launch keeps the honest sample/offline state.
## 2. Native map (P2)
- Fit the region tightly to the active spots' bounding box with modest padding (no inland half-screen); recenter/zoom to the selected spot when one is selected.
- Normal-size selected pin (slightly larger than others, not huge); verdict colours unchanged.
- Map slot at the top of Spots, directly under the title/search/chips, before the selected-spot card.
- Re-verify rect tracking when scrolled under the sticky header and when a sheet opens (native screenshots → .agent-handoff/shots/c/).
## 3. Polish
- Best-bet row: never split "7:30 AM" (non-breaking time); layout two lines: label line + time line.
- Target names not truncated ("Mangrove sn…") — allow 2 lines or wider items.
- Best-times readout at an hour outside any window: don't pair "Outside windows" with a positive fit word; show "Outside windows · fit 86" or similar neutral phrasing (shared helper with the Plan hourly table).
## Verify (no faked results)
All suites + scripts/test-ios-bridge.mjs + ios/test-bridge-native.mjs + ux-ios (sample) pass; cold-start timings (cached and uncached) measured on the simulator and reported; native screenshots for Today, Spots (map top / scrolled / sheet open), Species, Plan, Log → .agent-handoff/shots/c/. Report in .agent-handoff/codex-results-C.md with commands and exit codes.
