# V5 project handoff

Updated 2026-10-06. This handoff records the current checkout and the verified hindcast acquisition; it is not an acceptance of the A5 gate.

## Repository

- Root: `/Users/christiannunez/flagler-fishing-report`
- Branch: `v5-catch-forecast`
- HEAD: `9878f399cf7c157e0a7cf5ccaeebe8beec6d243e` — `V5 proto: audit fixes and professional polish`
- Acquisition files are tracked from `c9513dc`. No commit or push was made for this handoff update.
- At inspection, untracked work included `scripts/hindcast/run-hindcast.mjs`, `scripts/test-v5-hindcast.mjs`, two prototype audit notes, and `supabase/`. Preserve these and inspect before modifying; their tests and Supabase contents were not validated here.

## Completed: source acquisition

The cached observation window is 2025-10-01 00:00 UTC through 2026-10-01 00:00 UTC exclusive. The raw and normalized data are in gitignored `.cache/hindcast/`; the reproducible fetcher, manifest and source notes are `scripts/hindcast/`.

- KFIN via Iowa Environmental Mesonet ASOS: 7,348 hourly records for wind, gust, direction, precipitation, pressure and weather codes.
- CDIP 194 via SECOORA ERDDAP: 33,751 observations for waves and water temperature.
- NOAA CO-OPS hilo: eight distinct active tide stations, 1,410–1,411 records each. Each spans October 1, 2025 through September 30, 2026.
- No active tide station advertises CO-OPS water-temperature or meteorological products. Rain uses observed KFIN precipitation as a proxy; no historical NWS PoP or alerts were recovered.
- Monthly KFIN wind coverage is 78.76%–89.25%; CDIP wave/water-temperature coverage is 99.26%–100%. KFIN has 111 intervals over three hours; CDIP has none. CO-OPS hilo gaps over three hours mostly reflect the natural spacing of roughly four daily extrema.

## Verification recorded

- `node scripts/test-hindcast-data.mjs` — passed: all 10 normalized source files matched manifest row counts and SHA-256; 11 active spots mapped to full-year tide stations.
- Repeat `node scripts/hindcast/fetch-hindcast-data.mjs` — reused all 18 cached source/metadata requests.
- `node scripts/hindcast/fetch-hindcast-data.mjs --dry-run` — 0 new GETs planned after acquisition.
- Runtime observed in this environment: Node v26.8.1. The scripts target Node 22-compatible ESM; a Node 22-specific run is not recorded.

## Not yet verified

The full A5 replay and `scripts/test-v5-hindcast.mjs` have not been run in this handoff. The untracked runner points its default report output at `docs/v5-hindcast-report.md`; the preceding acquisition scope prohibited touching `docs/`. For a scoped replay, direct `runHindcast({ reportPath })` to `.cache/hindcast-out/` or obtain explicit authorization before writing the report under `docs/`.

Do not treat this dataset as historical forecast reconstruction. The replay uses future observations as explicitly labelled perfect-observation stand-ins and assumes alerts are `unverified/checked-none`; results cannot establish forecast skill, catch accuracy, probability calibration or operational safety. Hourly coverage also does not equal the required source-complete date coverage; report that by month, spot and mode with every denominator.

## Immediate next steps

1. Inspect the untracked replay harness/test and confirm data mappings, units, strict missingness and contract validity.
2. Run its offline test and full-year replay using cached data, with output under `.cache/hindcast-out/` while the docs restriction remains.
3. Review 06:00 today primary results and keep 19:00/evening/tomorrow separate; report source-complete, incomplete and safety-gated counts by month and spot×mode.
4. Present gate failures and any threshold/tide proposals to Chris. Do not change provisional floors or accept parameters without the approved gates and owner decision.
5. Continue production UI work from the audited prototype after the next scope is agreed.

For the durable project snapshot, see [.ai/PROJECT_STATE.md](.ai/PROJECT_STATE.md). Follow `AGENTS.md`; no Supabase application, publishing, push, merge or deployment is authorized here.
