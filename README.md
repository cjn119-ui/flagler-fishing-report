# Flagler Fishing Report

**Live app:** https://cjn119-ui.github.io/flagler-fishing-report/

A free shore-fishing planner for Northeast Florida, from St. Augustine to Flagler Beach. For 11 beach, pier and inshore spots it answers one question: is it worth going today, and when? Each spot gets a GO, MAYBE or SKIP, a list of fish that fit the season and conditions, and the best time windows.

Under the hood it is a data pipeline. Every 30 minutes a GitHub Actions job pulls official weather, marine and tide feeds, scores every spot, checks its own output, and publishes static JSON to GitHub Pages. No server and no paid APIs.

<!-- SCREENSHOT 1: phone view of the home screen (GO / MAYBE / SKIP by spot).
     Existing candidates in the repo: site/v5/proto/shots/plan-dark-375.png or spot-sheet-light-375.png -->
<!-- ![Home screen](docs/img/home.png) -->

<!-- SCREENSHOT 2: desktop view of one spot with its best windows and species.
     Existing candidate: site/v5/proto/shots/desktop-spot-light.png -->
<!-- ![Spot detail](docs/img/spot.png) -->

## The data problem

The app tells you how often fish are caught at each time of year, using 11 years (2015 to 2025) of NOAA's Marine Recreational Information Program (MRIP) shore-angler surveys. The first version of that history was wrong.

**The headline rate was off by almost five times.** The original logic said about 13% of ocean shore trips caught a fish. The corrected rate is 63% (585 of 931 trips). Inland went from 11% to 44% (770 of 1,742).

What caused it:

- **Wrong catch definition.** MRIP splits catch into fish the interviewer saw (Type A), fish kept but not shown (B1) and fish released (B2). The old logic counted only Type A, so every released fish was invisible. The fix counts a trip as a catch if the angler personally reported A, B1 or B2, and never credits group catches to one person. The rule follows NOAA's survey variable definitions and data user handbook.
- **Wrong grain.** NOAA reuses interview IDs for imputed records, so joining on ID alone merged 30 rows from 2020. The fix keys every trip on year, wave and ID, which keeps all 2,703 interviews and 4,020 catch rows.
- **Imputed records in the denominator.** Proxy interviews are now excluded from the primary rate and reported separately as a sensitivity check.
- **Thin slices.** Some months and site types have fewer than 30 interviews. Monthly rates are shrunk toward neighboring months and the annual rate, and anything under 80 interviews is labeled "low sample" in the app instead of shown as a precise number.

The full audit, with before and after counts, sample sizes by month and county, and source citations, is in [docs/data-qa-mrip.md](docs/data-qa-mrip.md). The rate and shrinkage rules are in section 2 of [docs/v5-architecture-decisions.md](docs/v5-architecture-decisions.md).

## Testing a catch model (and not shipping it)

The project also tested whether weather, water and tide conditions at interview time could predict a catch better than the time of year alone. The test is a regularized logistic regression scored with nested leave-one-year-out cross-validation, so every test year is held out from fitting, scaling and missing-value handling.

- **Any fish:** a small real improvement over month averages (Brier skill 0.086, AUC 0.68).
- **Whiting:** a modest improvement (Brier skill 0.056, AUC 0.72), driven mostly by water temperature, season and tide.
- **Other species:** no meaningful improvement.

The report's conclusion: these are small-sample associations that need independent validation before use, so the live app does not use the model. The report, including missing-data rates and calibration tables, is in [docs/v5-catch-model-report.md](docs/v5-catch-model-report.md).

## Setting the GO threshold

A GO that shows up every day is useless, and one that never shows up is too. A one-year backtest ran the scoring rules over every day from October 2025 to September 2026 using observed conditions, against gates set in advance: GO on 15% to 40% of days, no month above 70%, every spot at least 3%.

The result was GO on 30.5% of days (111 of 364). One spot, Vilano Bridge inshore, came in at 0.8%. It is reported as a miss, not tuned away. This was a check of the rules, not of forecast accuracy. Details: [docs/v5-hindcast-report.md](docs/v5-hindcast-report.md).

## How every deploy is checked

The refresh job in [.github/workflows/pages.yml](.github/workflows/pages.yml) runs every 30 minutes and treats bad data as a failure, not a footnote:

1. **Unit tests run first.** Scoring, tide, calculation and validator tests must pass before any data is generated.
2. **Generated output is validated.** A post-build check fails the run if report dates, live readings or predictions are stale, missing or out of range.
3. **One retry.** If a feed is briefly stale, the job waits and regenerates once. The freshness thresholds are not loosened for the retry.
4. **Last good data is restored.** If the retry also fails, the site keeps serving the previous good data, marked stale, instead of publishing bad numbers. If the previous data cannot be read, nothing deploys.
5. **Someone gets told.** If the data is more than six hours old, the run fails and opens a GitHub issue.

## Data sources

- **National Weather Service:** forecasts, alerts and airport observations
- **NOAA NDBC:** offshore buoys
- **NOAA CO-OPS:** tide predictions and water temperature
- **SECOORA:** nearshore wave buoys
- **Open-Meteo:** labeled fallback when NWS forecasts are unavailable (CC BY 4.0)
- **NOAA MRIP:** shore-angler survey history, 2015 to 2025

## How I built it

I built this with AI coding agents. I set the goal and the rules, directed the agents, reviewed their work and approved the decisions:

- Setting the product rules: what GO means, which safety and freshness gates block it, and the launch gates it had to pass
- Approving or rejecting each design decision (recorded with dates in [docs/v5-architecture-decisions.md](docs/v5-architecture-decisions.md))
- Reviewing the data audit, model test and backtest results

Most of the code was written by the agents.

**Stack:** JavaScript (Node 22) for the pipeline and app, Python with NumPy for the MRIP history and model work, GitHub Actions, GitHub Pages, and a Capacitor wrapper for an iOS build.

## Run it locally

```bash
SITE_URL= node scripts/generate.mjs   # build the report
python3 -m http.server -d site 8000   # or any static file server
node scripts/test-calculations.mjs     # one of the test suites CI runs
```

## Limits

- Ratings are a transparent conditions score, not a catch forecast or a safety clearance.
- MRIP surveys anglers at access points, mostly near the end of a trip. It is not designed for spot-level estimates, so history is shown by region and season, not by spot.
- The Smith Creek tide station is an inland reference, not an ocean beach tide.

---

## Technical reference

The notes below are the detailed operating rules for the pipeline and app.

### Layout
- `/` current app: Flagler Fishing V5 (GO / MAYBE / SKIP by spot, species suitability, best times). Served from `site/v5/proto/` through a `<base href>` in `site/index.html`; `/v5/proto/` still works.
- `/classic.html` the previous root app (live conditions, surf / pier and inshore bite outlooks, 7-day outlook).
- `/v1/`, `/v2/`, `/v3/` earlier versions, kept for reference. `/flagler-fishing/` and `/v4/` redirect to `/`.
- `/api/` JSON built by the scheduled workflow; `/shared/` code used by more than one version.

### Reliability checks

Run `node scripts/test-logic.mjs`, `node scripts/test-app.mjs`, `node scripts/test-catch.mjs` and `node scripts/test-calculations.mjs`. CI runs them before generating data and publishing.

`node scripts/test-generated-output.mjs` is a post-generation smoke test: it reads the files in `site/api/` that Pages will serve and fails the deploy if the current/next-day report dates (America/New_York), generation times, live weather/marine/tide readings (default max age 90 min, `MAX_LIVE_AGE_MIN`) or the surf/inshore catch prediction (generated tides + the NWS hourly feed the page uses) are wrong, stale, null or out of range. It prints one PASS/FAIL line per check and writes it to the Actions run summary; an NWS outage while building only warns. `node scripts/test-validator.mjs` tests the validator itself.

If generated-output validation fails, Pages restores the six root API JSON files from the currently deployed site before publishing, so a stale upstream feed cannot replace the last-good root data. The workflow still ends red and opens the scheduled-refresh issue; V5 files generated by that run can still publish. Restoration is fail-closed: if any deployed root API file cannot be fetched and parsed as JSON, the workflow does not deploy.

V5 keeps NWS forecasts and alerts primary. If NWS hourly/grid weather or nearshore waves are stale/unavailable, V5 falls back to Open-Meteo weather and marine forecasts, labels the fallback, and attributes it under CC BY 4.0. Since these endpoints do not expose the model issue time, fallback data cannot satisfy V5's GO freshness or tomorrow-wave issuance gates; use remains conservative until a timestamped NWS forecast returns. Open-Meteo's free API is for non-commercial use; an appropriate plan is required before commercial use.

The root app keeps successful source responses on the device for up to 24 hours of fallback viewing, labels saved data, and still expires airport observations after 2 hours and buoy observations after 3 hours. A failed forecast or alert check cannot produce a green Go, and active caution/warning alerts withhold time suggestions. Forecast windows require wind, rain and tide coverage throughout the interval. The score is a transparent conditions heuristic, not a catch forecast or safety clearance.

The separate bite outlook ranks fully covered, non-overlapping 2-hour windows. Surf / pier uses daylight proximity (45%), forecast wind (30%) and rain chance (25%), never the inland tide. Inshore uses Smith Creek tide movement (35%), light (25%), wind (20%) and rain (20%). The best window is labelled Promising at 0.78+, Mixed at 0.62+, otherwise Slow. These are relative, uncalibrated bands, not measured catch probabilities. Missing forecast or unchecked alerts withhold both views; missing tide data withholds inshore. FWC's regional guide informs seasonal target names, not legal harvest rules. The offshore buoy is current context only, not a local surf forecast.

Smith Creek 8720833 is an inland tide reference; its timings and interpolated movement are not ocean beach tides. NDBC 41117 is an offshore St. Augustine reference. Scheduled GitHub Actions runs can be delayed, so the page checks source observation timestamps rather than treating a successful request or page refresh as proof of fresh data.

### Calculation audit

`node scripts/test-calculations.mjs` checks exact unit conversions, independent weighted-score examples, threshold boundaries, monotonic scores, analytic tide interpolation/rate examples, daylight coverage, forecast gaps and brief wind spikes, 24-hour window limits, weekly date filtering, and repeated DST hours. This runs in CI. An optional directory argument cross-checks downloaded official `points`, `hourly`, `marine`, `tide-gmt`, and `tide-local` JSON fixtures.

Forecast location is Flagler Beach (29.4738, -81.131), resolved through NWS `/points` to JAX 89,29 during the September 30 audit. KFIN remains the separate airport observation. Current-score weights are exactly 45/35/20 for wind/rain/seas, renormalized over known dimensions, rounded once, then constrained by the worst-rule status band. Daily scores use 55/45 for daytime wind/rain. Window weather maxima use every intersecting forecast interval, while tide/light quality uses 30-minute midpoints. Skip-level forecast weather excludes a candidate. Tides are requested in GMT and formatted in New York time, preventing ambiguous repeated local hours.

Sunrise/sunset references were checked against the U.S. Naval Observatory on September 30 and both solstices, within one minute. Summer sunsets belong to the same New York date even when the UTC date is the following day. Report daylight windows stop at sunset; an evening window is omitted when sunset precedes its 6 PM start.
