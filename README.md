# Flagler Fishing Report

Static PWA on GitHub Pages. A GitHub Actions job (every 30 min) fetches NWS, NDBC and NOAA CO-OPS data, builds the report with `src/worker.mjs` (the same code as the Cloudflare Worker version), writes `site/api/*.json`, and deploys. No server or Mac required.

- Local build: `SITE_URL= node scripts/generate.mjs` then serve `site/`.
- The last good report is carried forward from the deployed `api/state.json` if a feed is down.
- Reports are rule-based from official feeds (no fishing rating, no LLM commentary).
