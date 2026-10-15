# Codex Job A — redesign to the concept (+ all of tasks-3.md)

Repo /Users/christiannunez/flagler-fishing-ios, branch feature/capacitor-ios, HEAD 4ca425e. Start: `pwd; git rev-parse --show-toplevel; git status --short`.
Read: .agent-handoff/redesign.md (primary spec), .agent-handoff/concept.webp (view it — the target look), .agent-handoff/tasks-3.md (ALL sections 1–7 are in scope), AGENTS.md.
Editable: site/v5/proto/* (except img/, which another Codex job is filling right now — read it, never write it), ios/bridge.*, scripts/build-ios-web.mjs, scripts/ux-ios.mjs, new tests. Protected (never edit): site/index.html, site/main.js, site/shared/*, site/v1–v4, site/style.css, site/v5/engine/*, site/v5/*.js catalogs. Do not commit. Do not invoke Claude. Do not uninstall the app from the simulator.

Additional required fix — header overflow (owner saw the app "zoomed in"): with a long spot name ("Bridge of Lions & bayfront seawall") the spot pill does not shrink, overlaps refresh, and pushes the right-hand buttons off-screen, giving the page horizontal overflow. Fix: header controls never overflow (pill/label `min-width:0`, ellipsis); `html,body{overflow-x:hidden}` safety; in the iOS build only add `maximum-scale=1` to the viewport meta (web keeps pinch zoom). Test with the LONGEST spot name in ACTIVE_SPOTS at 320/375/430 px on every tab.

Images: load via a small manifest built from site/v5/proto/img/CREDITS.json (fish/<id>, spots/<id>, hero; ignore fish/ref/). Missing image → designed gradient placeholder of the same aspect ratio. Never show broken images. In-app Credits screen lists CREDITS.json entries (generated ones say "Illustration generated with OpenAI image_gen").

Native hooks for Job B (do not implement native code): follow the "Job B contract" in redesign.md exactly (#spots-map slot, FFNativeMap.show/hide, ffmap:select event, FFNotify.sync and toggle).

Verification (no faked results): all existing suites (pages.yml list + scripts/test-v5-*.mjs + test-ios-bridge + test-v5-catch-log) pass; extend scripts/ux-ios.mjs per tasks-3.md §6 and §3 (tab-bar drag + content swipe across all 5 tabs both directions), long-name header overflow test, species realistic-first/label tests; screenshots every tab × Dark/Night/Light at 375 into .agent-handoff/shots/redesign/; frame-time numbers. Then npm run ios:sync, xcodebuild for simulator A488F352-DB47-40AE-8C25-D256D90FB728, install, launch, screenshot each tab natively if you can navigate via the URL hash at launch, else Today only. Append a concise report to .agent-handoff/codex-results.md.

## OWNER DIRECTION (2026-10-10): "mesh the two together" — this overrides any reading of the concept as a replacement
The result is the CURRENT V5 app wearing the concept's design, not the concept's app. Rules:
1. Keep every existing V5 capability and information unit. Before editing, write `.agent-handoff/mesh-map.md`: a table of every current UI element per tab (verdict seal + certainty states, headline, best bet/backup, targets + suitability bars, "how this is decided"/why, confidence, local history, best-times scrubber + legend + selected-hour detail, today-vs-tomorrow, alerts/banners, stale/offline/fallback labels, source attributions, spot picker, species detail sheet, plan days 1–2 windows + days 3–7 outlook semantics, Log, More sheet) → where it lives in the new layout. Nothing may be dropped; things may move lower or into an expandable section.
2. Adopt from the concept: layout, hierarchy, hero imagery, cards, chips, carousels, charts styling, tab bar, typography and colour.
3. Add from the concept only what redesign.md lists (conditions strip, species row, curve chart, map slot, spot card, species carousel/tabs, plan day chips, tide chart, hourly table, favorites).
4. Where the concept and V5 conflict, V5's semantics win (GO/MAYBE/SKIP, suitability ≠ chance, honest staleness/fallback labels, no "AI-powered").
5. The existing scrubber interaction stays (restyle it as the concept's bar/curve chart, still draggable).
Partial edits from a cancelled first attempt may exist in the working tree (scripts/build-ios-web.mjs, site/v5/proto/proto.js) — inspect `git diff` and continue from them or revert only your own partial changes.
