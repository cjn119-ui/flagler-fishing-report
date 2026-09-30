# Flagler Fishing Report

Static PWA on GitHub Pages. A GitHub Actions job (every 30 min) fetches NWS, NDBC and NOAA CO-OPS data, builds the report with `src/worker.mjs` (the same code as the Cloudflare Worker version), writes `site/api/*.json`, and deploys. No server or Mac required.

- Local build: `SITE_URL= node scripts/generate.mjs` then serve `site/`.
- The last good report is carried forward from the deployed `api/state.json` if a feed is down.
- Reports are rule-based from official feeds (no fishing rating, no LLM commentary).

## Layout
- `/` current app (Flagler Fishing): live conditions, best times, 7-day outlook.
- `/v1/`, `/v2/`, `/v3/` earlier versions, kept for reference. `/flagler-fishing/` and `/v4/` redirect to `/`.
- `/api/` JSON built by the scheduled workflow; `/shared/` code used by more than one version.

## Reliability checks

Run `node scripts/test-logic.mjs` and `node scripts/test-app.mjs`. CI runs both before generating data and publishing.

The root app keeps successful source responses on the device for up to 24 hours of fallback viewing, labels saved data, and still expires airport observations after 2 hours and buoy observations after 3 hours. A failed forecast or alert check cannot produce a green Go, and active caution/warning alerts withhold time suggestions. Forecast windows require wind, rain and tide coverage throughout the interval. The score is a transparent conditions heuristic, not a catch forecast or safety clearance.

Smith Creek 8720833 is an inland tide reference; its timings and interpolated movement are not ocean beach tides. NDBC 41117 is an offshore St. Augustine reference. Scheduled GitHub Actions runs can be delayed, so the page checks source observation timestamps rather than treating a successful request or page refresh as proof of fresh data.
