# Flagler Fishing V5 — build spec

V5 is the foundation of a future fishing app, not a prettier report. It answers, in about 10 seconds:
**Is it worth fishing? Where? When? What should I target? What should I throw?**
The user never interprets raw weather, tide, solunar, wind, pressure, swell or temperature data.

Product brief: hyperlocal, action-oriented, species-specific, explainable, fast. Not a weather dashboard.
Out of scope: accounts, social, chat, nationwide coverage, nautical charts, big infrastructure.

## Decisions (owner-approved 2026-10-05)

| Topic | Decision |
|---|---|
| Path | `site/v5/` alongside the current app; root `/`, v1–v3 untouched. |
| Launch region | St. Augustine → Flagler (11 active locations in `site/v5/spots.js`). Jax/Nassau rows stay cataloged with `active: false`. Volusia excluded for now. |
| Modes | surf, pier, inshore (ICW/river/inlet). |
| Headline | GO / MAYBE / SKIP. Species show a 0–100 **suitability** (labelled as such, never "chance"). Historical catch rate shown separately ("4 in 10 local shore anglers caught one in October"). |
| Persistence | Supabase schema as versioned SQL migrations in the repo only. Do not create or write to a live project. |
| Buoys in browser | SECOORA ERDDAP CDIP mirror (CORS OK) via `buoyUrls()` in `spots.js`; NDBC copy in `api/live/marine.json` is the fallback. |
| Look | Main report (`site/style.css`) app shell — compact dark-slate cards, score ring, hourly strip, stat tiles, ranked list, 7-day bars — plus the v1/v3 sunset hero and cyan pill buttons (`site/v3/theme.css`) for the location header. Light and dark. |
| Stack | Vanilla ES modules, no framework, no build step, no npm deps (matches repo). Relative URLs, hash routing — wrappable later by Capacitor. |

## Existing inputs (already in the repo — do not rewrite)

- `site/v5/spots.js` — location catalog + `buoyUrls()`. Field meanings are documented in the file header.
- `site/v5/species.js` — 14 species, per-mode setups (`setupFor`), preferences, MRIP name mapping, `needsStructure`, `bycatch`.
- `site/v5/data/first-coast-history.json` — built by `scripts/build_first_coast_history.py` (MRIP intercept microdata 2015–2025, Duval/Flagler/Nassau/St. Johns shore trips; `ocean` = surf/pier, `inland` = inshore; slices `all`, `by_month`, `by_county`, `by_site_type`, `by_interview_hour`, `by_year`; each slice `{n, p_any_fish, p_any_fish_w, fish_per_trip, species: {COMMON: {p, pw, per_trip}}}`; plus `water_temp.by_day_of_year[1..365] = {mean_f, p10_f, p90_f, n_days}` from NDBC 41117 2017–2025). Monthly n is small (19–197 ocean) — always shrink.
- `site/shared/logic.js`, `site/shared/catch.js`, `src/worker.mjs` — reuse helpers where they fit (tide interpolation `seriesFromHilo`/`tideRate`, NWS fetch patterns, wind parsing). Do not change their behaviour; the root app depends on them.

## Architecture

```
raw sources → normalized observations → derived factors → predictions → PredictionRun JSON → UI
```

One engine, no DOM, importable in the browser **and** Node (generator, tests, future API/notifications/widgets):

```
site/v5/engine/
  contracts.js   MODEL_VERSION, JSDoc typedefs, small constructors + validate*() for every contract below
  sources.js     fetchers → NormalizedObservation; every fetch injectable (fetchImpl) and failure-tolerant
  astro.js       sunrise/sunset/civil twilight, moon phase/illumination, moon transit/underfoot/rise/set, solunar periods
  factors.js     pure factor functions: (inputs) → PredictionFactor
  model.js       species suitability, windows, recommendation, confidence, today-vs-tomorrow
  run.js         buildPredictionRun({ now, horizon, locations, fetchImpl, history }) → PredictionRun
```

Morning (current-day) and evening (next-day) views both call `buildPredictionRun` with `horizon: "today" | "tomorrow"`. Presentation may differ; calculation must not. No important value is computed only in UI code.

### Sources (`sources.js`)

Each returns `{ ok, source, station, url, observedAt, fetchedAt, values, error }` and never throws. Missing input lowers confidence; it never breaks the run.

| Input | Source | Notes |
|---|---|---|
| Hourly forecast (wind speed/dir, gusts, rain %, short forecast/thunder) | NWS `/points/{lat},{lon}` → `forecastHourly` | Cache the points lookup per location (localStorage in browser, memory in Node). |
| Alerts | NWS `/alerts/active?point=` | Unchecked alerts ⇒ confidence penalty, never GO. |
| Pressure trend | NWS `/stations/{id}/observations?limit=12` where id = `observationStations[0]` from points | 3 h and 6 h change in hPa. |
| Tides | CO-OPS `datagetter` `product=predictions&interval=hilo&time_zone=gmt&datum=MLLW` for `spot.tide`, 3-day range | Interpolate (cosine) to 30-min series; rate + direction. |
| Waves / buoy water temp | `buoyUrls(spot.cdip)` (SECOORA ERDDAP); fallback `api/live/marine.json` | ERDDAP rows: `[time, Hs m, Tp s, dir]` and `[time, °C]`. Stale > 3 h ⇒ treat as missing. |
| Water temp (nearshore) | CO-OPS `product=water_temperature&date=latest` for `spot.waterTemp` when set | Else buoy; inshore using buoy ⇒ confidence penalty + note. |
| History | `data/first-coast-history.json` | Loaded once. |

### Factors (`factors.js`)

Each factor is a `PredictionFactor`:
`{ key, label, value, unit, score (0–1), weight, contribution (score×weight, normalized), detail (one short sentence), source, available }`.
Unavailable factors are excluded and the remaining weights renormalize (same rule as `weightedScore` in `shared/week.js`), and `available:false` factors are still listed so the UI can say what was missing.

| key | How scored (heuristic v5.0 — tune later) |
|---|---|
| `season` | Shrunk monthly share of trips catching the species in that mode: `p_m* = (n_m·p_m + k·p_all)/(n_m + k)`, k = 40, with the month blended 50 % + 25 % each neighbour month; county slice blended in with k = 150. Score = `p_m*` ÷ species' max month `p*` (0–1). Also exported as `historicalRate`. |
| `waterTemp` | Trapezoid on `species.waterF [min, idealLow, idealHigh, max]`: 1 inside ideal, linear to 0 at min/max. Also report anomaly vs `water_temp.by_day_of_year` (detail only in v5.0). |
| `tide` | From 30-min tide rate & direction at the slot. `moving`: normalized |rate|; `incoming`/`outgoing`: direction match × rate, with 0.35 floor for the other direction while moving; `any`: 0.7 constant. Weight × `{high:1.3, medium:1, low:0.6}[spot.tideSensitivity]`. |
| `light` | `lowlight`: 1 within ±60 min of sunrise/sunset, tapering to 0.4 midday, 0.25 night; `day`: 1 daylight, 0.3 night; `any`: 0.8. |
| `solunar` | 1 in a major period (moon transit/underfoot ±60 min), 0.75 in a minor (moonrise/moonset ±30 min), else 0.45; +0.1 within 3 days of new/full moon (cap 1). |
| `wind` | Speed: 1 at ≤ 10 mph, linear to 0 at 25 mph (gusts > 30 mph ⇒ 0). Direction vs `windExposure.facingDeg`: offshore +0.1, onshore −0.15 for `calm`-surf species, +0.05 for `rough`-surf species (ocean modes); inshore uses speed only plus −0.1 when the wind blows along the exposed fetch. |
| `waves` | Ocean modes only. Hs → class: calm < 0.6 m, moderate 0.6–1.2 m, rough > 1.2 m; score 1 if class matches `species.surf`, 0.6 adjacent, 0.2 opposite; Hs > 2 m ⇒ 0. |
| `pressure` | 6 h change: steady/slowly falling (−0.5 to −3 hPa) 1; steady (±0.5) 0.8; rising 0.5–3 hPa 0.6; rapid change (> 3 hPa either way) 0.4. |
| `rain` | 1 − rain%/100; thunder in the short forecast ⇒ 0 and a safety gate. |

Default weights (sum 1 before renormalizing; store in one exported `WEIGHTS[mode]` table):

| | season | waterTemp | tide | light | wind | waves | pressure | solunar | rain |
|---|---|---|---|---|---|---|---|---|---|
| surf / pier | .24 | .18 | .14 | .10 | .10 | .10 | .05 | .05 | .04 |
| inshore | .24 | .18 | .20 | .12 | .10 | — | .06 | .06 | .04 |

Hard caps: water temp outside `[min, max]`, or `season` score < 0.1 ⇒ suitability ≤ 20. `needsStructure` species only on locations whose `structure` is pier/jetty/bridge/dock/seawall/rocks. `bycatch` species count toward "anything biting" but are never a target.

### Model (`model.js`)

- `scoreSpecies(species, location, mode, slotTime, ctx)` → `SpeciesPrediction` with `suitability` (0–100, rounded once), `factors[]`, `historicalRate` (0–1, shrunk), `calibratedProbability: null` (reserved until outcomes exist), `confidence` (0–100) + `confidenceReasons[]`, `setup` from `setupFor(species, mode)`.
- Slots every 30 min across the horizon window (today: now → 21:00 local, extended into tomorrow 05:00–10:00 if fewer than 3 h remain; tomorrow: 05:00–21:00). Windows = contiguous slots where the location/mode's top-species suitability stays within 8 points of its local max, 60–150 min long, non-overlapping, ranked; expose up to 4 per location/mode. Window time labels in America/New_York (beware DST; reuse the repo's GMT-in, NY-out approach).
- `Recommendation`: across all active locations × modes × windows, choose the best by `top suitability × confidenceFactor`, where confidenceFactor = 0.6 + 0.4·confidence/100. Verdict: **GO** if top suitability ≥ 70 and confidence ≥ 50 and no gate; **MAYBE** if ≥ 50; else **SKIP**. Gates (force SKIP for the affected windows, list the reason): thunder, sustained wind ≥ 25 mph or gusts ≥ 35 mph, active NWS warning for the point, Hs > 2.5 m for ocean modes. Include `why[]` = the top 3 positive factor details and the worst limiting factor. `targets[]` = top 3 non-bycatch species (suitability + historicalRate). `setup` = setup of the #1 target in that mode. `backup` = best alternative that differs in location **or** mode (prefer a different mode), else a later window. `comparison` = today vs tomorrow best suitability and verdict (the run computes the other horizon's summary too).
- Confidence 0–100: start 100; −25 forecast missing or > 6 h old (−10 for 3–6 h); −20 alerts unchecked; −20 tide missing (−10 for ocean modes where tide station is > 15 mi away per `tideNote`); −10 waves missing (ocean modes); −10 water temp missing (−5 if inshore uses buoy); −5 pressure missing; −5 to −15 by history n for the slice (n < 30: −15, < 80: −8). Clamp 5–100; level High ≥ 75, Moderate ≥ 50, else Low. Keep every reason string.

### Contracts (`contracts.js`) — stable JSON for PWA, API, Supabase and native clients

```
Location            id, name, area, county, modes[], structure, lat, lon, tide, cdip, tideSensitivity, windExposure, access[], targets[], notes
Conditions          locationId, at, wind{mph,gustMph,dirDeg,onshore}, rainPct, thunder, airTempF, waterTempF{value,source,anomalyF},
                    waves{hsFt,periodS,dirDeg,observedAt}, tide{heightFt,rateFtPerHr,direction,nextHigh,nextLow,station},
                    pressure{hPa,change3h,change6h}, light{sunrise,sunset,phase}, moon{phase,illumination,major[],minor[]},
                    alerts[], sources[{name,observedAt,fetchedAt,ok,stale}]
PredictionFactor    key, label, value, unit, score, weight, contribution, detail, source, available
SpeciesPrediction   speciesId, locationId, mode, windowStart, windowEnd, suitability, historicalRate, calibratedProbability(null),
                    confidence, confidenceReasons[], factors[], setup{where,bait[],lures[],rig}
FishingWindow       locationId, mode, start, end, topSuitability, species[SpeciesPrediction], gates[]
Recommendation      verdict(GO|MAYBE|SKIP), horizon, locationId, mode, window{start,end}, targets[], setup, why[], limiting,
                    confidence, confidenceLevel, backup{locationId,mode,window,speciesId,reason}, comparison{today,tomorrow}
PredictionRun       id, modelVersion("v5.0.0"), horizon, generatedAt, validFrom, validTo, region, recommendation,
                    locations[{location, conditions, windows[]}], inputs{sources[]}, notes[]
```

All times ISO-8601 UTC in JSON; the UI formats America/New_York.

### Static API (scheduled build)

`scripts/generate-v5.mjs` (run in `.github/workflows/pages.yml` after `generate.mjs`, before validation) calls `buildPredictionRun` with Node `fetch` and writes:
`site/api/v5/today.json`, `site/api/v5/tomorrow.json` (full PredictionRun each) and `site/api/v5/index.json` ({generatedAt, modelVersion, today: summary, tomorrow: summary}). A failed source degrades confidence; only a total failure keeps the previous deployed files (same carry-forward idea as `generate.mjs`). Keep `site/api/` gitignored.

### Supabase (`supabase/migrations/20261005000000_v5_schema.sql`) — write only, do not apply

Tables (uuid PKs, `created_at timestamptz default now()`, FKs, useful indexes, RLS enabled with no anon write policies):
`model_versions(version pk, released_at, notes, weights jsonb)`,
`locations(id text pk, …catalog fields…, active)`,
`source_observations(id, source, station, location_id null, observed_at, fetched_at, kind, values jsonb, unique(source,station,kind,observed_at))`,
`prediction_runs(id, model_version fk, horizon, generated_at, valid_from, valid_to, confidence, inputs jsonb)`,
`species_predictions(id, run_id fk, location_id fk, mode, species_id, window_start, window_end, suitability, historical_rate, calibrated_probability null, confidence, factors jsonb)`,
`recommendations(id, run_id fk unique, verdict, location_id, mode, window_start, window_end, targets jsonb, setup jsonb, why jsonb, backup jsonb, confidence)`,
`catch_outcomes(id, fished_start, fished_end, location_id fk, mode, caught bool, species_id null, quantity int, approx_size_in numeric, bait text, notes text, prediction_run_id fk null, species_prediction_id fk null, reported_via text)`.
Add a view `outcomes_vs_predictions` joining each outcome to the run active at `fished_start` for that location (latest run with `valid_from <= fished_start < valid_to`). Store forecast snapshots only as prediction runs — no duplicate raw forecast tables.

## UI (`site/v5/index.html`, `app.js`, `style.css`, `ui/*.js`) — phase B

Mobile-first single page, bottom tab bar: **Today · Spots · Species · Plan**. Renders PredictionRun objects only (no scoring in UI). Loads `api/v5/today.json` first (instant, offline-capable), then optionally re-runs the engine live for the selected location and swaps in fresher results.

- **Today:** sunset hero with location name + area pill (tap ⇒ location sheet). Verdict ring: GO (green) / MAYBE (amber) / SKIP (red) with the top suitability. One-line headline, e.g. "Pompano & whiting on the incoming tide, 6:40–8:25 AM". Cards: Best bet (location · mode · window), Targets (top 3 with suitability bars and "X in 10 caught one this month"), Use (bait/lure/rig), Why (top factors with expandable factor table — each factor's value, score, weight, detail), Backup, Confidence (level + reasons), Tomorrow vs today.
- **Interactive timeline:** horizontal 24–36 h strip (30-min slots) with tide curve, light band, solunar marks and suitability line; drag/tap scrubber updates the conditions tiles and species ranking for that time. Mode switcher (surf / pier / inshore) where the location offers several.
- **Spots:** ranked list of active locations for the current horizon (verdict chip, best window, top species), filter by mode, "near me" via geolocation (nearest by distance), favourites (localStorage). Tap ⇒ sets location and returns to Today.
- **Species:** grid of species valid in the region; detail sheet with suitability now, best location/window for it, setup, 12-month historical bar chart from history, water-temp fit. "Target this" re-ranks Today and the timeline for that species.
- **Plan:** 7 days. Today/tomorrow from runs; days 3–7 use season + NWS daily wind/rain + tide range + moon phase (clearly labelled "outlook"). Tap a day ⇒ best windows.
- Share (Web Share API, fallback copy link with `#spot=…&mode=…&t=…`). Pull-to-refresh / refresh button. Install prompt. Explicit source timestamps and stale chips. Respect `prefers-reduced-motion`. Keyboard and screen-reader friendly (buttons, aria-pressed, aria-live on verdict).
- PWA: `manifest.webmanifest` (scope `./`, standalone), `sw.js` (app shell cache-first, `api/v5/*.json` stale-while-revalidate, external APIs network-first with last-good copy; versioned cache name; never cache errors).

## Tests (CI-gated)

`scripts/test-v5.mjs` (add to the workflow unit-test step):
catalog integrity (every active spot valid; targets valid for its modes; every species has ≥ 1 MRIP name present in history; tide station ids are 7 digits); factor math (trapezoid edges, shrinkage formula with worked examples, weight renormalization with missing factors, caps and `needsStructure`); window selection (non-overlap, length bounds, DST fall-back day); verdict thresholds and gates; confidence penalties; astro against fixed references (sunrise/sunset for Flagler on 2026-06-21 and 2026-12-21 within 2 min of USNO; moon phase on known full/new moon dates within 1 day; moon transit within 15 min of a published value); a full `buildPredictionRun` against recorded fixtures (`scripts/fixtures/v5/*.json`, fetchImpl stubbed) validating every contract; graceful degradation (each source failing in turn still yields a run with lower confidence). `scripts/test-generated-output.mjs`: add warn-level checks that `api/v5/*.json` exist, validate, and are < 90 min old.

## Definition of done

1. `node scripts/test-v5.mjs` and all existing tests pass; existing pages unchanged.
2. `SITE_URL= node scripts/generate.mjs && node scripts/generate-v5.mjs` writes valid v5 runs from live data.
3. `site/v5/` served locally renders Today/Spots/Species/Plan for every active location with no console errors, at 375 px and desktop, light and dark; works offline from the last run.
4. Supabase migration file parses as SQL (`psql --set ON_ERROR_STOP=1` against a throwaway Postgres if available; otherwise a careful review) — never applied to a live project.
5. README "Layout" gains a `/v5/` line and a short V5 section.
