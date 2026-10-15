# Codex job R results

## Scope and implementation

Implemented the UX and logic fixes in `tasks-R.md` within the R-owned web prototype and scripts:

- Fixed the Today hero condition strip, selected-period observation readings and unit formatting, Plan day selection and hourly outlook wording, and the ended-window headline.
- Coerced closed modes to open modes across mode selection, hashes, saved spots, and map selection; closed-pier species focus cannot become a target.
- Fixed hourly table wrapping, Plan condition tiles, tide chart bounds, species art and labels, spot search/filter order, closed badges/captions, theme indicators, image loading/placeholders, sheet close motion, and tab swipe/re-render state preservation.
- Added bounded local-cache trimming with an honest cached-source label, robust catch-day run selection and Eastern time handling, invalid catch-row filtering, CSV formula-prefix protection, and Pages URL sharing from Capacitor.
- Updated the native web bundle exclusions and added regression coverage for observation shapes, cache behavior, catch data safety, and the iOS cache header.
- Updated the browser acceptance harness to wait for each requested tab to become active during tab-bar drag coverage. This avoids issuing the next drag while a large live-data render is still committing.

## Files changed by R

- `site/v5/proto/proto.js`, `proto.css`, `proto-data.js`, `proto-observations.js`, `catch-log.js`, `index.html`
- `scripts/build-ios-web.mjs`, `scripts/ux-ios.mjs`, `scripts/test-ios-bridge.mjs`, `scripts/test-v5-catch-log.mjs`, `scripts/test-v5-proto-data.mjs`, `scripts/test-v5-proto-observations.mjs`
- `.agent-handoff/codex-results-R.md`

No `ios/**`, Capacitor config, or package files were edited by R. Those concurrent changes belong to Job B and remain untouched.

## Verification

The web bundle build completed successfully with `node scripts/build-ios-web.mjs` (web-only; no iOS sync/build/simulator was run).

The full `for f in scripts/test-*.mjs; do node "$f"; done` suite sweep completed. All runnable suites passed except `scripts/test-generated-output.mjs` (exit 1): this checkout lacks `site/api/report.json`, `site/api/next-day-report.json`, and `site/api/live/{weather,marine,tides}.json`. `scripts/test-hindcast-data.mjs` and `scripts/test-v5-hindcast.mjs` exited 0 with explicit skips because `.cache/hindcast` is absent. The restore-last-good test exited 0; no root API files remained modified.

Focused final checks all exited 0:

- `node --check site/v5/proto/proto.js && node --check site/v5/proto/proto-data.js && node --check site/v5/proto/proto-observations.js && node --check scripts/ux-ios.mjs`
- `node scripts/test-v5-catch-log.mjs` — 14 assertions passed.
- `node scripts/test-v5-proto-data.mjs`
- `node scripts/test-v5-proto-observations.mjs`
- `node scripts/test-ios-bridge.mjs`
- `node scripts/test-v5-proto-ux.mjs`
- `git diff --check`

`node scripts/ux-ios.mjs` passed twice consecutively in sample mode, then `UX_LIVE=1 node scripts/ux-ios.mjs` passed once against the live Pages reports copied into scratch `ios-www/api/v5/`. All three runs used installed Chromium because Playwright WebKit binaries are unavailable. Each run captured 15 screenshots (five tabs × Dark/Night/Light) at 375×812, with zero console errors. Sample frame p95 was 18 ms and 19 ms; live frame p95 was 19 ms. Screenshots are in `.agent-handoff/shots/r/sample/` and `.agent-handoff/shots/r/live/`.

The live Today and Tomorrow reports targeted 2026-10-10 and 2026-10-11. Measured serialized cache sizes were 1,079,259 and 1,087,079 characters, respectively, below the 1.5 MB per-run budget. Both reports passed the existing prediction-run validator during live acceptance.

The test environment supplied Node v26.8.1; this project documents Node 22. No Node 22 runtime was available in the checkout environment.

## Git and handoff

- Branch: `feature/capacitor-ios`
- HEAD: `200f971`; the task file named `b307ce0` as its base, but the live checkout was already at `200f971` when work began. No commit created.
- R's edits are uncommitted. Job B's concurrent native/package edits and `.agent-handoff/codex-results-B.md` are also present; they are not included as R changes.
- Independent review should focus on the cross-screen observation selection and closed-mode filtering in `proto.js`, cache trimming preserving all offline views, and the product presentation of the closed-pier badges and elapsed-window headline.
- Remaining verification limitation: generated root API output validation could not run without its local generated artifacts; native iOS behavior was outside R's scope and was not run.
