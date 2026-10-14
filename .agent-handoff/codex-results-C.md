# Codex job C — results

Date: 2026-10-10  
Repo: `/Users/christiannunez/flagler-fishing-ios`  
Branch: `feature/capacitor-ios`  
HEAD: `bf8b0e5124753c0a356165c3961514430ec37d8a` (handoff's `310097c` was stale)  
Device: iPhone 18 Pro simulator, iOS 27.0, `A488F352-DB47-40AE-8C25-D256D90FB728`

## Changes

- Startup reads each trimmed cached horizon independently, paints a valid cached report immediately, and refreshes today and tomorrow concurrently. Today updates as soon as its request finishes; later renders preserve scroll and disclosure state when data IDs have not changed.
- Uncached startup renders the included sample while the requests run. Both its banner and freshness chip identify it as sample/not-live; the chip says “loading live data” while the request is in progress. An offline first launch keeps the offline/sample banner.
- Added per-horizon fetch, JSON parse, context, first-render and render timings. Added DEBUG-only WebKit error, rejection and `console.error` forwarding to `NSLog`, plus cache-clear and tab/map screenshot launch hooks.
- Native map fits the active spots' bounding rectangle with 24/28-point padding, zooms to 2.4 km when a spot is selected, and scales the selected marker by 1.08. Spots order is heading, filters, search, map, selected-spot card, list.
- Kept the “7:30 AM” time together and laid the best-bet label/time out on two lines. Target names can wrap to two lines. Outside-window fit copy is neutral and shared by the best-times and Plan hourly readouts.

## Verification

All commands below ran in this checkout. Exit codes are recorded as observed.

| Command/check | Result |
|---|---|
| `node scripts/test-logic.mjs`, `node scripts/test-app.mjs`, `node scripts/test-catch.mjs`, `node scripts/test-calculations.mjs`, `node scripts/test-validator.mjs` | Pass, exit 0 each |
| `node scripts/test-v5-contracts.mjs`; `node scripts/test-v5-sources.mjs`; `node scripts/test-v5-integration.mjs`; `node scripts/test-v5-model.mjs`; `node scripts/test-v5-run.mjs`; `node scripts/test-v5-catch-log.mjs`; `node scripts/test-v5-closures.mjs`; `node scripts/test-v5-proto-data.mjs`; `node scripts/test-v5-proto-observations.mjs`; `node scripts/test-v5-species-presentation.mjs`; `node scripts/test-v5-proto-ux.mjs` | Pass, exit 0 each. The final `node scripts/test-v5-proto-ux.mjs` rerun after the sample-label fix passed. |
| V5 hindcast and hindcast-data suites | Self-skipped: `.cache/hindcast` is absent. |
| `node scripts/test-ios-bridge.mjs` | Pass, exit 0 |
| `node ios/test-bridge-native.mjs` | Pass, exit 0 |
| `node scripts/ux-ios.mjs` | Pass, exit 0 on Chromium fallback; Playwright WebKit is unavailable. Covers sample UX, tab swipes/drags, 320/375/430 widths, sheets and catch-log flows; reported p95 frame 18 ms and zero console errors. |
| `node --check site/v5/proto/proto.js`; `node --check scripts/test-v5-proto-ux.mjs`; `git diff --check` | Pass, exit 0 after final source change |
| `npm run ios:sync` | Pass, exit 0; Capacitor synchronized 7 iOS plugins. |
| `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'id=A488F352-DB47-40AE-8C25-D256D90FB728' CODE_SIGNING_ALLOWED=NO build -quiet` | Pass, exit 0. Xcode emitted the existing scheme warning that supported-platform metadata is empty. |
| In-place `xcrun simctl install` and native simulator launches/screenshots | Pass. The app was not uninstalled. |

### Simulator timing evidence

- Cached launch: `FLAGLER_PERF first_content_ms=99.0 ctx_ms=43.0 render_ms=43.0 source=cached offline=false`, logged at `native_elapsed_s=1.034`. This meets the ≤2 s cached target.
- Uncached launch after the final label change: `first_content_ms=449.0 ctx_ms=119.0 render_ms=119.0 source=sample offline=false`, logged at `native_elapsed_s=3.583`. The live today response completed at `native_elapsed_s=4.181` (fetch 581 ms, parse 14 ms); tomorrow completed at `3.994` (fetch 391 ms, parse 17 ms). This meets the ≤6 s first-launch target. The code now labels the interim sample explicitly; the screenshot was taken after live data had replaced it.
- Earlier cold uncached run before the final label-only change also returned live today at native elapsed 1.381 s (fetch 350 ms, parse 13 ms). Timings vary with simulator startup and network response.
- DEBUG state logs confirmed map plugin/slot availability. The under-header run reported `slotRect.y=80`; another clipped-top run reported `slotRect.y=0`. Scrolling triggered the existing native content-offset observer and the map remained aligned. Opening the More sheet hides the map behind the modal; the native screenshot records this state.
- One early launch logged an anonymous WebKit `Script error. @ :0:0` at 11:26. It did not recur in subsequent simulator runs; no cause could be identified from that message. Later runs showed no console-error or unhandled-rejection messages.

## Native screenshots

All are in `.agent-handoff/shots/c/`:

- `today-cached-early.png`
- `today-uncached-6s.png`
- `today-uncached-live.png`
- `spots-map-top.png`
- `spots-map-under-header.png`
- `spots-map-sheet.png`
- `species.png`
- `plan.png`
- `log.png`

The map-top screenshot shows all active pins, but the default all-spots view includes inland map context because the active spots span a long north/south range and the native map viewport is wider than that bounding box. A specifically selected spot uses the tighter 2.4 km region. In the scrolled capture the page title/header has scrolled offscreen; native map clipping remains aligned at the recorded scroll position. These are the remaining visual review points.

## Git and safeguards

- No commit was made and Claude was not invoked.
- No app uninstall occurred; the simulator app was updated in place.
- Working tree contains the implementation and this results document. HEAD and branch remain as recorded above.
