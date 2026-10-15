Repo: /Users/christiannunez/flagler-fishing-ios (git origin: cjn119-ui/flagler-fishing-report). Read AGENTS.md first.
First step: run `pwd; git rev-parse --show-toplevel; git status --short` and stop if the root is not this repo.

The working tree has other uncommitted work (site/v5/proto/*, ios/*, scripts/test-v5-proto-*, scripts/ux-ios.mjs). Do not revert, reformat or touch those. Do not commit, push, or modify site/api/. Another agent is editing site/v5/proto/* and ios/* right now — stay out of them.

Scope: V5 engine data inputs only. Allowed files: site/v5/engine/run.js, site/v5/engine/sources.js, site/v5/engine/adapters/*, site/v5/spots.js (station metadata only), site/v5/engine/contracts.js (only if a new observation kind needs registering), scripts/test-v5-sources.mjs, scripts/test-v5-run.mjs, scripts/test-generated-output.mjs (only if a new kind needs allowing), scripts/fixtures/*.
Do NOT change scoring weights, GO thresholds, params.js values, or `factors.tide.rateNormalizationScale` (owner decisions pending).
Node 22, no npm dependencies, no build step. Tests must not hit the network (use fixtures).

## 1. Bug: falling-tide height is inverted (run.js `tideAt`, ~line 59–66)
Height uses `mid - amp*cos(phase)` for both rising and falling segments. For a falling segment (H→L) at f=0 it returns the LOW height. Live evidence (flagler-icw, station 8720833): 20:30Z height 1.04 (just before the 20:34Z high), 21:00Z height 0.42 (just after) — should still be ~1.0.
Fix: rising → `mid - amp*cos(phase)`, falling → `mid + amp*cos(phase)`. Rate/direction are already correct; keep them.
Add a regression test: H 1.04 at T0, L 0.32 at T0+6h → height just after T0 ≈ 1.04, decreasing monotonically to 0.32; rising case unchanged.

## 2. Pressure trend is null for every forecast slot
`pressureChange(obs, at)` (run.js ~53) returns null when the slot is >1 h after the newest station observation, so every future window gets confidence reason `pressureUnavailable`.
Add an always-on Open-Meteo hourly `pressure_msl` (hPa) forecast source per location (dedupe locations that round to the same coordinates if easy), following the existing adapter pattern in adapters/open-meteo.js (timeouts, failure(), provider/kind/status entries in sourceStatus, `ok`/`stale` flags). Suggested kind: "pressureForecast".
In pressureChange: keep current station-based behaviour when station data covers `at`; otherwise compute the 6 h change from the forecast series (use forecast values for both endpoints so station/model bias doesn't leak in). If Open-Meteo fails, behave exactly as today (null).
Make sure generated output still validates (scripts/test-generated-output.mjs, contracts).

## 3. Inshore water temperature uses an ocean buoy
Inshore spots get water temp from SECOORA ocean buoy station 194, and the engine adds confidence reason `inshoreBuoyTemp`.
Find NOAA CO-OPS stations that actually report `water_temperature` near each inshore spot (use the metadata API, e.g. https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=watertemp, and confirm with a recent datagetter call). For inshore spots with an active station within ~25 mi, add a CO-OPS water temperature observation (same `waterTemperature` shape as today, include temperatureC and temperatureF) and prefer it over the buoy for inshore modes. Drop `inshoreBuoyTemp` only when the inshore station reading was used and is fresh. Spots with no qualifying station keep current behaviour. Record station id + distance next to the existing tide station metadata.

## Verify
Run with the repo's conventions (plain `node`): scripts/test-v5-sources.mjs, test-v5-run.mjs, test-v5-contracts.mjs, test-v5-model.mjs, test-v5-integration.mjs, test-generated-output.mjs (if it runs offline), test-logic.mjs, test-app.mjs. All must pass.

## Report back (concise)
Files changed; chosen CO-OPS stations with distances; evidence the three fixes work (test names, before/after values); anything you could not finish or any open question. No transcripts.
