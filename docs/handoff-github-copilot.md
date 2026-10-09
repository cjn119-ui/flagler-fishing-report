# Handoff for GitHub Copilot — Flagler Fishing V5

Written 2026-10-07 (about 02:00 America/New_York). Repo: `cjn119-ui/flagler-fishing-report` (GitHub Pages site, static PWA). Read `AGENTS.md` and `.ai/PROJECT_STATE.md` first; this file adds the current operational picture. Facts below were verified against git, GitHub runs and live URLs at the time of writing; re-verify before acting.

## What this project is
A First Coast (St. Augustine to Flagler) fishing-decision app. The root site (`/`, `/v1/`–`/v3/`) is the original weather/bite report and is **protected**: do not change its behaviour. V5 lives under `site/v5/` and answers: worth fishing today, where, when, what to target, what to throw, using a GO / MAYBE / SKIP verdict with per-species suitability.

Stack: vanilla ES modules, no npm dependencies, no build step. Node 22 in CI (a local Node 26 is used by some agents). Static hosting on GitHub Pages via `.github/workflows/pages.yml` (tests, generate, validate, deploy; runs on push to `main` and every 30 minutes).

## Where things stand
- **Engine (done, tested):** `site/v5/engine/` (contracts, params, copy, sources and adapters, history, astro, factors, model, run builder), generator `scripts/generate-v5.mjs`, local archive scaffolding `scripts/archive-v5.mjs` (upload path refuses to run). Seasonal-benchmark GO rule is owner-approved: GO = suitability >= 70 AND >= the location x mode seasonal benchmark + 4; a null benchmark caps at MAYBE.
- **Prototype:** `site/v5/proto/` (Today / Spots / Species / Plan, spot and species sheets, timeline scrubber). On `main` it now loads live data (`proto-data.js`), uses the real clock, refreshes about every 5 minutes, handles stale/offline with a cached last-good copy, and shows a "Sample data — not live" banner if live files are missing.
- **Hindcast:** `docs/v5-hindcast-report.md` (full-year, perfect-observation sensitivity). Headline GO 30.5% (target 15-40%), monthly max 60%, coverage passes; two inshore cells fall below the 3% per-cell floor (vilano-bridge 0.8%, bridge-of-lions 2.5%).
- **Tests (all passing locally when last run):** legacy `scripts/test-logic.mjs`, `test-app.mjs`, `test-catch.mjs`, `test-calculations.mjs`, `test-validator.mjs`; V5 `test-v5-contracts.mjs`, `test-v5-sources.mjs`, `test-v5-integration.mjs`, `test-v5-model.mjs`, `test-v5-run.mjs`, `test-v5-hindcast.mjs`, `test-v5-proto-data.mjs`, `test-hindcast-data.mjs`. Run them with `node scripts/<name>.mjs` (non-zero exit on failure). `test-app.mjs` has once failed on a time-dependent assertion and passed again.

## The live-site problem (most urgent)
**The live site has not deployed since 2026-10-06 ~19:42-23:34 UTC.** Every run since has stopped at the "Validate generated output" step, so the live `/v5/proto/` still serves the OLD 785-line sample-data prototype and `/api/v5/today.json` returns 404 (the V5 data is generated in CI but only deployed if the whole job deploys).

Four real bugs were fixed and merged on 2026-10-07 (PRs #12, #15, #16, #17):
1. Tide window: the 24 h filter dropped the 4th event; now a 26 h window returning the next four events (`src/worker.mjs`).
2. `latestReport()` served a future-dated preview as CURRENT (`report_date is 2026-10-08, expected 2026-10-07`); it now only considers reports dated today or earlier.
3. The evening next-day preview failed the 240-minute CURRENT age check overnight; a narrow, warned exception allows it (same local date, generated previous day after 17:00 as the Next-Day Preview, <= 18 h, `MAX_EVENING_PREVIEW_AGE_MIN`).
4. Weather station fallback (KFIN -> KDAB -> KSGJ) accepted stations with unusable fields; it now requires finite temperature and converted wind speed (0 wind is valid).

**Remaining blocker (upstream, not our code):** `HOURLY: updateTime is stale: ~476 min old, limit 360`. The NWS Jacksonville gridpoint (`api.weather.gov/gridpoints/JAX/89,29/forecast/hourly`) `updateTime` was 2026-10-06T21:47:28Z and had not changed at last check. When NWS publishes its next update the next scheduled run should deploy everything. **Do not loosen the 360-minute, 90-minute, 240-minute or 4-tide-event thresholds** to force a deploy.

**In flight (not merged, not pushed):** a Luna-written change on local branch `workflow-v5-deploy-on-stale` (worktree under the Claude scratchpad `.../wf-wt`). Owner-approved policy: if root validation fails, still deploy, but restore the root `api/*.json` files to exactly what is currently deployed (via `scripts/restore-last-good-api.mjs`, fail-closed if any download fails) and publish only V5 files and V5 data; the run still ends red and the failure issue still opens. When validation passes, behaviour is unchanged. Review its step order carefully before merging; a mistake could stop all deploys. It must not change thresholds, the schedule, tests, or generate steps.

## Branches and PRs (verify with `git branch -a` / `gh pr list`)
- `main`: deployable state; recent merges #14 (live-data prototype + V5 generate step), #15 (report date), #16 (evening preview rule), #17 (weather values).
- `v5-wip-glass-supabase` (pushed, **do not merge**): partial Liquid Glass / iOS mobile restyle of the prototype (`index.html`, `proto.css` partly edited; `proto.js` untouched; `check-layout.mjs` audit script; screenshots), a Supabase migration draft (`supabase/`, unapplied and unverified), audits and an old handoff. Resume the glass work only after the live deploy works.
- Leftover remote branches from earlier work (`fix-generation-validation`, `v5-proto-publish`, `v5-catch-forecast`, `v5-wrapup`, `v5-live-data`, ...) can be deleted once confirmed merged.

## Decisions still owned by the repo owner (do not decide for them)
1. The two failing inshore cells: review their inputs vs request an exception to the 3% floor.
2. Accept launch values: `goSuitabilityMin` 70, `goBenchmarkMargin` 4, realistic floor 0.05, tide scale 0.50 (still marked provisional in `site/v5/engine/params.js` apart from the approved GO rule). Benchmarks are in-sample on one year; a holdout year is needed before claiming more.
3. Whether weekly release-asset archive uploads (400-day retention) may be enabled (designed, **not** enabled).
4. PR #11 put the whole V5 branch on `main`; the engine files, history JSON and catalogs are served publicly under `/v5/`. Confirm that exposure is intended.
5. Any Supabase project: none exists and none is authorized. Supabase is not in the live launch path; keep it to unapplied repo drafts.
6. Glass restyle publication and any change to freshness policy.

## Guardrails (carry over from the owner)
- Never push, merge, deploy, enable Supabase, enable archive uploads, or change workflow schedules without the owner's explicit approval for that action.
- Do not relax validator thresholds, tune parameters to hit a gate, or accept provisional parameters on your own.
- Suitability is a 0-100 "fit" label, never a probability or "chance"; user-facing history is phrased in "trips", not "anglers". `calibratedProbability` stays null.
- Do not touch the root site's behaviour, `/v1/`–`/v3/`, or secrets.
- Prefer small, test-first changes with a fixed clock for anything time-dependent; the scheduled pipeline is date/time sensitive (America/New_York vs UTC).
- Verify with the repo's own tests and the real `SITE_URL= node scripts/generate.mjs && node scripts/test-generated-output.mjs` before proposing a fix to the pipeline.

## Key files
- Pipeline: `.github/workflows/pages.yml`, `scripts/generate.mjs`, `src/worker.mjs`, `scripts/test-generated-output.mjs`, `scripts/generate-v5.mjs`.
- V5 engine: `site/v5/engine/{contracts,params,copy,history,astro,factors,model,run,sources}.js`, `site/v5/engine/adapters/*`, `site/v5/spots.js`, `site/v5/species.js`, `site/v5/data/first-coast-history.json`.
- Prototype: `site/v5/proto/{index.html,proto.css,proto.js,proto-data.js,NOTES.md,sample-*.json}`.
- Docs: `docs/v5-spec.md`, `docs/v5-product-decisions.md`, `docs/v5-architecture-decisions.md`, `docs/v5-inshore-go-decision.md`, `docs/v5-go-definition-decision.md`, `docs/v5-hindcast-report.md`, `docs/v5-review-*.md`, `docs/data-qa-mrip.md`, `docs/v5-threshold-sheet.md`.

## Suggested next steps (in order)
1. Check whether NWS has refreshed (`updateTime` above) and whether the latest `Refresh and deploy` run on `main` is green; if so confirm `/v5/proto/proto.js` is the new version and `/api/v5/today.json` returns 200 with a real `generatedAt`.
2. Review and, only with owner approval, merge `workflow-v5-deploy-on-stale` (step order, fail-closed restore, red-run signal).
3. Fix the hindcast report's "absolute-only" info row, which duplicates the headline instead of showing the unbenchmarked share (`scripts/hindcast/run-hindcast.mjs`).
4. Resume the glass restyle from `v5-wip-glass-supabase` after the deploy path is reliable: fix text overlap at 320/375/393/430 px, safe areas, >= 12 px type, glass surfaces with fallbacks, 44 px targets, AA contrast, with `check-layout.mjs` as the gate.
5. Owner decisions above, then production V5 UI and validating the Supabase draft in a throwaway Postgres.
