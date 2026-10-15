# Codex job M — results

Date: 2026-10-15  
Repo: `/Users/christiannunez/flagler-fishing-ios`  
Branch: `feature/capacitor-ios`  
Starting and final HEAD: `aef790e`  
Simulator requested: `A488F352-DB47-40AE-8C25-D256D90FB728`

## Changes

1. **Directional tab movement:** tap navigation now enters from one viewport width in tab order (320 ms); reduced motion keeps the opacity-only transition. This replaces the 18 px rise-like entrance. Navigation marks the destination and its seal as visited, so delayed renders do not replay first-visit stagger/seal effects. First-visit count-ups and bars still start during render, while navigation is starting.
2. **No post-slide replay:** added navigation visit bookkeeping in `animateView`; `navigation:true` continues to suppress `v-in` and stagger. The current first-value and bar guards remain one-shot.
3. **Release velocity:** retained the existing rolling gesture samples (last 120 ms), 200 ms projection, sign and distance commit guards, and 180–380 ms velocity-derived settling. The same recent-velocity helper remains in sheet drags.
4. **Tab indicator:** the existing single `.tabs::before` spring rule remains active for tap/release, with transitions disabled while dragging. Indicator motion now uses the same diminishing edge rubber-band as the content for tabbar and content drags.
5. **Edge behavior:** content edge drag already used the diminishing rubber-band helper; the indicator now follows that edge resistance instead of stopping abruptly at index 0/4.
6. **Motion rules:** kept the existing `--dur-1..4` and `--ease-out`, `--ease-spring`, `--ease-in` tokens. Removed unused fade/segment keyframes and a dead segment selector, removed the duplicate segmented-control transition override, and stopped the seal intro rule from overriding the distinct seal-swap rule. The primary segmented-control rule now owns its spring.
7. **Sheets:** retained the current recent-velocity dismissal, whole-sheet drag when body scroll is at top, upward rubber-band, progress-tied scrim, and mobile background scale/dim (maximum scale 0.96). The UX drag helper now starts in `.sheet-b` to cover body-origin drags. Runtime verification was blocked (see below).
8. **Scroll restoration:** retained the existing pre-render `window.scrollTo` for tab changes and sets preview `scrollTop` from the saved tab position before the preview enters. This was not browser-verified in this run.

Reduced-motion pull-to-refresh now uses opacity feedback and a 100 ms fade instead of translating `main`; cancellation follows the same settle path without triggering refresh. The targeting chip, immediate `segment()` aria update, `hydrateFactors` / `fetchRunDetails`, momentum-scroll/horizontal-row swipe gates, and haptic commit path were preserved.

## Left unchanged

- Existing sheet drag, scrim, scale/dim, scroll restoration, swipe projection, and haptic code already contained the requested behaviors in this checkout, so I retained those paths and limited changes to the tab indicator and UX drag origin. Their runtime feel still needs the blocked browser/simulator pass.
- Seal swap, value tick, details expansion, toast, and scrubber-thumb timing already referenced the motion vocabulary or had no identified defect in this source review; I did not retune their visual timing without runtime evidence.
- The generated native web bundle is produced by `npm run ios:sync`; I did not hand-edit generated assets.

## Motion tokens

| Token | Value |
|---|---|
| `--dur-1` | `120ms` |
| `--dur-2` | `200ms` |
| `--dur-3` | `300ms` |
| `--dur-4` | `360ms` |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` |
| `--ease-spring` | `cubic-bezier(.6,1,.8,1)` |
| `--ease-in` | `cubic-bezier(.4,0,.9,.4)` |

## Verification

Commands ran in this checkout. Exit codes are actual observed results.

| Command | Exit | Result |
|---|---:|---|
| `node scripts/test-logic.mjs` | 0 | Pass |
| `node scripts/test-app.mjs` | 0 | Pass |
| `node scripts/test-catch.mjs` | 0 | Pass |
| `node scripts/test-calculations.mjs` | 0 | Pass |
| `node scripts/test-validator.mjs` | 0 | Pass |
| `node scripts/test-v5-contracts.mjs` | 0 | 11 groups passed |
| `node scripts/test-v5-sources.mjs` | 0 | 15 passed, 0 failed |
| `node scripts/test-v5-integration.mjs` | 0 | Pass; expected fixture failure logs emitted |
| `node scripts/test-v5-model.mjs` | 0 | 62 passed, 0 failed |
| `node scripts/test-v5-run.mjs` | 0 | 26 passed, 0 failed |
| `node scripts/test-v5-catch-log.mjs` | 0 | 14 assertions passed |
| `node scripts/test-v5-closures.mjs` | 0 | Pass |
| `node scripts/test-v5-proto-data.mjs` | 0 | Pass |
| `node scripts/test-v5-proto-observations.mjs` | 0 | Pass |
| `node scripts/test-v5-species-presentation.mjs` | 0 | Pass |
| `node scripts/test-v5-proto-ux.mjs` | 0 | Pass, including final rerun |
| `node scripts/test-v5-hindcast.mjs` | 0 | Skipped: `.cache/hindcast` absent |
| `node scripts/test-hindcast-data.mjs` | 0 | Skipped: `.cache/hindcast` absent/incomplete |
| `node scripts/test-ios-bridge.mjs` | 0 | Pass |
| `node ios/test-bridge-native.mjs` | 0 | Pass |
| `node --check site/v5/proto/proto.js && node --check scripts/ux-ios.mjs && git diff --check` | 0 | Pass |
| `npm run ios:sync` | 0 | Pass; synced 7 Capacitor plugins |
| `cmp site/v5/proto/proto.js ios-www/v5/proto/proto.js && cmp site/v5/proto/proto.css ios-www/v5/proto/proto.css` | 0 | Source and generated JS/CSS match |
| `UX_NO_SCREENSHOTS=1 node scripts/ux-ios.mjs` | 1 | Could not start fixture server: Node `listen EPERM` on `127.0.0.1`; no browser interaction or frame samples occurred |
| `xcrun simctl list devices | rg 'A488F352-DB47-40AE-8C25-D256D90FB728'` | 1 | CoreSimulatorService connection invalid in worker; requested device could not be inspected |
| `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'id=A488F352-DB47-40AE-8C25-D256D90FB728' -derivedDataPath /private/tmp/flagler-job-m-derivedData CODE_SIGNING_ALLOWED=NO build -quiet` | 74 | Could not resolve Swift packages: outbound GitHub DNS/network unavailable; CoreSimulatorService also unavailable |

The UX runner did not reach its interaction checks, so **swipe and sheet-drag p95 frame times are unavailable**. The iOS simulator build/install/launch and DEBUG NSLog forwarding were not completed. This is worker-environment evidence only; it does not establish a simulator or app failure. The host Terminal and Xcode UI paths were denied by the computer-use environment.

## Scope and Git state

- No changes to `site/api/` or `site/v5/engine/`; no commit or push.
- Changed for this job: `site/v5/proto/proto.js`, `site/v5/proto/proto.css`, `scripts/ux-ios.mjs`, and this results file.
- `.agent-handoff/tasks-M.md` was already modified at task start and was left untouched.
- Final review should focus on actual WKWebView gesture feel, first-moved-frame cost, p95 frame time, and DEBUG NSLog output once run on the host simulator.
