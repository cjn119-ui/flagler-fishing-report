# Flagler Fishing Report

Static PWA on GitHub Pages. A GitHub Actions job (every 30 min) fetches NWS, NDBC and NOAA CO-OPS data, builds the report with `src/worker.mjs` (the same code as the Cloudflare Worker version), writes `site/api/*.json`, and deploys. No server or Mac required.

- Local build: `SITE_URL= node scripts/generate.mjs` then serve `site/`.
- The last good report is carried forward from the deployed `api/state.json` if a feed is down.
- Reports are rule-based from official feeds; the home page adds an uncalibrated bite outlook. No LLM commentary.

## Layout
- `/` current app (Flagler Fishing): live conditions, surf / pier and inshore bite outlooks, best times, 7-day outlook.
- `/v1/`, `/v2/`, `/v3/` earlier versions, kept for reference. `/flagler-fishing/` and `/v4/` redirect to `/`.
- `/api/` JSON built by the scheduled workflow; `/shared/` code used by more than one version.

## Reliability checks

Run `node scripts/test-logic.mjs`, `node scripts/test-app.mjs`, `node scripts/test-catch.mjs` and `node scripts/test-calculations.mjs`. CI runs them before generating data and publishing.

`node scripts/test-generated-output.mjs` is a post-generation smoke test: it reads the files in `site/api/` that Pages will serve and fails the deploy if the current/next-day report dates (America/New_York), generation times, live weather/marine/tide readings (default max age 90 min, `MAX_LIVE_AGE_MIN`) or the surf/inshore catch prediction (generated tides + the NWS hourly feed the page uses) are wrong, stale, null or out of range. It prints one PASS/FAIL line per check and writes it to the Actions run summary; an NWS outage while building only warns. `node scripts/test-validator.mjs` tests the validator itself.

The root app keeps successful source responses on the device for up to 24 hours of fallback viewing, labels saved data, and still expires airport observations after 2 hours and buoy observations after 3 hours. A failed forecast or alert check cannot produce a green Go, and active caution/warning alerts withhold time suggestions. Forecast windows require wind, rain and tide coverage throughout the interval. The score is a transparent conditions heuristic, not a catch forecast or safety clearance.

The separate bite outlook ranks fully covered, non-overlapping 2-hour windows. Surf / pier uses daylight proximity (45%), forecast wind (30%) and rain chance (25%), never the inland tide. Inshore uses Smith Creek tide movement (35%), light (25%), wind (20%) and rain (20%). The best window is labelled Promising at 0.78+, Mixed at 0.62+, otherwise Slow. These are relative, uncalibrated bands, not measured catch probabilities. Missing forecast or unchecked alerts withhold both views; missing tide data withholds inshore. FWC's regional guide informs seasonal target names, not legal harvest rules. The offshore buoy is current context only, not a local surf forecast.

Smith Creek 8720833 is an inland tide reference; its timings and interpolated movement are not ocean beach tides. NDBC 41117 is an offshore St. Augustine reference. Scheduled GitHub Actions runs can be delayed, so the page checks source observation timestamps rather than treating a successful request or page refresh as proof of fresh data.

## Calculation audit

`node scripts/test-calculations.mjs` checks exact unit conversions, independent weighted-score examples, threshold boundaries, monotonic scores, analytic tide interpolation/rate examples, daylight coverage, forecast gaps and brief wind spikes, 24-hour window limits, weekly date filtering, and repeated DST hours. This runs in CI. An optional directory argument cross-checks downloaded official `points`, `hourly`, `marine`, `tide-gmt`, and `tide-local` JSON fixtures.

Forecast location is Flagler Beach (29.4738, -81.131), resolved through NWS `/points` to JAX 89,29 during the September 30 audit. KFIN remains the separate airport observation. Current-score weights are exactly 45/35/20 for wind/rain/seas, renormalized over known dimensions, rounded once, then constrained by the worst-rule status band. Daily scores use 55/45 for daytime wind/rain. Window weather maxima use every intersecting forecast interval, while tide/light quality uses 30-minute midpoints. Skip-level forecast weather excludes a candidate. Tides are requested in GMT and formatted in New York time, preventing ambiguous repeated local hours.

Sunrise/sunset references were checked against the U.S. Naval Observatory on September 30 and both solstices, within one minute. Summer sunsets belong to the same New York date even when the UTC date is the following day. Report daylight windows stop at sunset; an evening window is omitted when sunset precedes its 6 PM start.
