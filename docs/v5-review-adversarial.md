# V5 engine (A1–A4) — adversarial review

Reviewer: Claude Sonnet 5.5 (Medium), review-only. Repo `flagler-fishing-report`, branch `v5-catch-forecast`, HEAD `43c5e78`. Offline. Findings already fixed in `docs/v5-review-a3.md` are not repeated.

Method: ran `test-v5-model.mjs` (42/42), `test-v5-run.mjs` (11/11), `coverage-v5.mjs`, and `generate-v5.mjs --fixtures` (output to gitignored `site/api/v5`). Fed about 40 scenarios through `buildPredictionRun` using observations in the shape the real adapters emit (`adapters/*.js`), not the fixture shape (see F9). Scratch harness lived outside the repo.

## Verdict: ACCEPT-WITH-FIXES — not shippable to a UI as is

The scoring skeleton, determinism, contracts and failure containment are sound. The claim "correctly serves a hyperlocal fishing decision" is **false today**:

- Alert-based safety gates are inert against real NWS data.
- Species eligibility is computed but never used to pick targets, backups or headline species.
- The reason line on every non-gated day is the same wrong sentence.
- With no live data at all, the engine reports suitability 100.

Five High items block any front-end consuming this output.

## Findings (prioritized)

| # | Sev | Where | Reproducible input | Observed | Why it matters | Fix |
|---|---|---|---|---|---|---|
| F1 | **High** | `model.js:58` (`safetyGates`) | `alerts` rows as `adapters/nws-alerts.js` emits them: `{event:"Tornado Warning",severity:"Extreme"}`, `{event:"Gale Warning",severity:"Severe"}`, `{event:"High Surf Advisory"}`, `{event:"Rip Current Statement"}` | All four: `gates:[]`, verdict MAYBE, suit 96, headline "Sheepshead morning window". The gate only matches `severity==="warning"` or `level==="warning"`, which NWS never emits (severity is Extreme/Severe/Moderate/Minor). | The "active weather warning" safety gate can never fire. Tornado Warning day reads "Great fit". | Gate on `event` matching `/Warning$/` (+ tornado/hurricane/tropical storm/flash flood/gale/storm/hurricane-force/high surf/rip-current events by an explicit list), and `expires`/`ends` covering the slot. Add an adapter-shape test. |
| F2 | **High** | `model.js:62-66` (`verdictFor`), `run.js:111-115`, `model.js:146-163,164-168` | Any scenario, e.g. perfect Oct 5 08:00 ET | `eligibility` only blocks GO; it does not block MAYBE, target listing, driver choice or backup. Candidate pool: 237 `off-list`, 20 `no-structure`, 147 `rare`, 84 `bycatch`, 0 `realistic`. Backups seen: Vilano Bridge → **`vilano-beach/surf/sheepshead`** (sand beach, `no-structure` AND off the spot list) "MAYBE". Salt Run (creek) and Matanzas Inlet list **sheepshead 96 / mangrove 93 as targets 2 and 3** while tagged `no-structure`. `flagler-pier:pier` targets `redfish:87:off-list, sheepshead:90:off-list`. `bySpecies.jack` focuses Vilano Beach (not on its list). Cold day (50 °F): headline **"Black sea bass morning window"** at Vilano Bridge, off-list, MAYBE 59. | Names a species the spot doesn't offer or can't physically fish. Spec says off-list species must not drive GO; here they drive MAYBE headlines and backups. Only a 5-point tie-break prefers `onTargetList`. | Filter candidates for selection/backup/targets to `eligibility==="realistic"` (or on-list and structure-ok when floor is null); keep others only in a labelled "also possible" list. Apply `acceptableBackup` to eligibility too. |
| F3 | **High** | `run.js:94-99` (`reasonFor`) + `params.js` `realisticFloor:null` | Every non-gated day | Every spot-day reads: "Survey history or spot coverage does not support a realistic target." — attached to the *top recommendation*, next to "Great fit 96". `realisticFloor===null` makes every on-list species `rare/belowRealisticFloor`. SKIP days from cold or hot water or out-of-season (suit 20) get the same sentence (`caps` ignored); real cause is water temp. Low confidence (<50) says "capped at MAYBE" though nothing is capped, GO is simply unreachable. | The 10-second answer contradicts itself on first open and looks broken. | Set a provisional floor (0.05 per product decision A) now. Build `reason` from `caps` first (water/season), then gates, then confidence. Drop "capped" wording unless a cap applied. |
| F4 | **High** | `factors.js:90-100`, `run.js:103,115` | `drop` every observation (or `observations: []`) | Run status "degraded", verdict MAYBE, **suitability 100**, conf 5 Low, headline "Florida pompano morning window". Forecast missing alone: suit 98, conf 45. Unavailable factors are dropped and weights renormalized, so season+solunar+light alone score 100. Band label is derived from suitability, so rare species get "Great fit". | Overconfident on no data; false precision (100). Copy with all feeds down is the same shape as a healthy day. | Cap suitability when available-weight share < ~0.6 (e.g. scale by share or cap at 49), and emit a distinct "no live data" headline/reason. Band should require eligibility `realistic` or show a "rare here" qualifier. |
| F5 | **High** | `history.js:88-91`, `data/first-coast-history.json` | `getHistoricalTiming`, any species | Season score = month rate ÷ species' own peak month, so a species at its peak month scores 1.0 whatever the absolute rate. Inshore sheepshead: peak month October is **4 hits in 154 trips** (2.6% raw, 2.2% shrunk; peak 0.022); Feb is 1/109, Mar 2/159. Result: sheepshead is the #1 inshore "Great fit 96" in October though its best month is a 2% species and the species file itself says "Late winter is peak". Inshore redfish peak = 0.053 (Nov 7/116); trout 0.083. | Hits of 1–4 pick the "peak month" and the top headline species. Statistically indefensible and the exact artefact product decision A warned about. | Blend relative season with absolute rate (e.g. season = min(rel, rate/0.20)); require a minimum hit count (≥10) for a month to define the peak; never let an eligibility `rare` species lead. |
| F6 | Med-High | `run.js:166-168`, `scripts/generate-v5.mjs:306` | `now` between ~20:00 and 23:59 ET (8:15 pm, 8:59 pm, 9:30 pm, 11:59 pm) | `No scored window available for today 2026-10-05`; generator swallows it, exits 0, republishes the *previous* files. 7:45 pm still works. 12:01 am works. | From about 8 pm to midnight the **tomorrow** forecast is frozen too (the evening is when anglers plan tomorrow; `recommendedHorizon` is "tomorrow" after 15:00). A silent exit 0 hides it. | Build tomorrow even when today has no windows; emit `today` with an explicit `kind:"closed"` recommendation. At least `console.error` and non-zero exit. |
| F7 | Med-High | `factors.js:48-55`, `params.js` `safety`, `waves`, `rain` weight 0.04 | Scenarios below | **Onshore wind 24 mph/gust 33** + 2.2 m surf: surf spots MAYBE 69 pompano. **Wind 20/gust 30** onshore: bluefish surf MAYBE 82. **Surf 2.4 m (8 ft), light wind**: Vilano Beach surf pompano MAYBE 81 (pompano wants calm). **Thunder probability 45%**: MAYBE 93. **Rain probability 90%**: MAYBE 91 (rain costs 4% weight). Gates are step functions at 25 mph / 35 gust / 2.5 m / thunder ≥50%. | Rough-surf and storm-adjacent days read "Great fit" because one cap factor can't outweigh the other 90%. A skeptical angler sees MAYBE 81 on an 8-ft day. | Add soft hard-caps: waves > 1.8 m → cap suitability ≤ 49 for non-rough species; gust ≥ 30 or wind ≥ 20 onshore cap; PoP ≥ 70% or thunder ≥ 30% cap at MAYBE-low. Add a day-level rain factor. |
| F8 | Med | `run.js:53-58` (`pressureChange`) | `pressureObservations` as the adapter emits (12 rows, newest first, about 12 h) with a falling trend of −4 hPa/6 h | Today slots after about 6 h past the newest reading and **all of tomorrow** return `pressureChange6hHpa: 0` (not null): both `now` and `old` resolve to the newest row. Pressure scores "neutral 0.8" as a measured value; confidence `pressureUnavailable` never fires. | Fabricated measurement for ≥ 50% of slots; "Falling pressure" is precisely a bite signal. | Return null when the slot is more than ~1 h past the newest observation. |
| F9 | Med | `scripts/fixtures/v5/run-inputs.json`, `run.js:67-72` | `generate-v5 --fixtures` | Fixture `gridForecast.values` is `{rows:[{windMph,windGustMph,...}]}`; the real adapter emits `{windSpeed:[…],windGust:[…],…}`. In fixture runs `gridAt` returns `{}`, `windGustMph` is **null**, so `conditionsReady` is false and **GO is unreachable in any fixture-based test**, while `test-v5-run` still passes. Fixture tide is hourly-dense; the real source is `interval=hilo` (see F10). | Tests give false assurance for wind-gust, thunder-probability and tide paths. | Regenerate the fixture from `fetchSources` with the recorded source fixtures; add a test that asserts gust and thunder are non-null. |
| F10 | Med (latent) | `run.js:59-66` (`tideAt`), `params.js` tide scale `null` | Real CO-OPS `hilo` rows | Rate comes from the two neighbours of the *nearest* hi/lo within ±90 min. Near a high, both neighbours are lows → rate ≈ 0 → `"slack"`; elsewhere → null. Timeline for Flagler Pier: tide null in 14/26 slots, `slack` in all others (every slot shows rate 0.00). Currently harmless because the scale is null (tide factor permanently unavailable, −20 confidence on every run, so the ceiling is 80). | The moment someone sets the scale, tide scoring is wrong everywhere (slack at peaks, null in between); the UI timeline already shows it. | Interpolate between bracketing hi/lo (cosine) for height and derivative for rate. |
| F11 | Med | `run.js:126-134` (`planner`) | Any month | Days 3–7 label = "Promising" whenever the month has any ocean trips (`nTrips>0`). All 12 months have trips, so every outlook day is "Promising", all at confidence 35. Oct 7–11 output: `Promising ×5`. Uses only the `ocean` bucket. | Not information; looks like an unconditional endorsement. | Derive from the month's top realistic species rate (Promising/Mixed/Tough by band), or hide outlook until real. |
| F12 | Med | `copy.js:48-66`, `run.js:24-27` | 30 h old forecast (not flagged stale by the adapter) / any source | Freshness text says "gridForecast: Current data · 0 min old" (age = `fetchedAt`, not `issuedAt`); failed sources also say "Data unavailable · 0 min old". Confidence line concatenates up to 15 reasons incl. raw kinds ("alerts source failed or is stale.; gridForecast source failed or is stale.; …"). | Understates forecast age; leaks internal field names; reads like debug output. | Age from `issuedAt ?? observedAt`; one aggregated line ("Wave data missing") per cause; hide ages for unavailable sources. |
| F13 | Med | `run.js:82`, `model.js:44`, `spots.js` | Active spot catalog | `get("coopsWaterTemperature")` is a kind no adapter emits, so `waterTempSource` is always null: the "inshore uses offshore buoy temperature" disclosure is dead code. `tideDistanceMi` is not set on any spot (`grep` count 0) though notes say "26 mi south": the `distantTideStation` confidence reason never fires. All 11 active spots use cdip 194 / buoy 41117: inshore river spots score on the ocean buoy temperature with no caveat. | Documented disclosures and confidence penalties that were decided in product decision #3 do not exist. | Emit a real `waterTemperatureSource` from the winning provider; add `tideDistanceMi` to the catalog (or compute haversine to the station). |
| F14 | Med | `model.js:164-168` (`orderTargets`), `run.js:115` | Cold water 50 °F; hot 90 °F | Targets padded to 3 regardless of fit: `seabass:59 Decent off-list, bluefish:20 "Not a fit" off-list, jack:20 "Not a fit" off-list`; hot: `jack:65 Decent off-list, bluefish:20 "Not a fit"`. | A "Targets" list containing "Not a fit" fish. | Floor target list at a minimum suitability and eligibility. |
| F15 | Med | `model.js:148-163` | `perfect` and `windy` scenarios, today and tomorrow | `backup.reason` is the constant "A nearby alternative may fit better." for every kind. Backups worse than the primary labelled this way: 13 per run (e.g. 96 → 90; windy 82 → 69; Salt Run 91 → staug-pier blackdrum 74). 4 per run are `no-structure`, 14 off-list. Thunder (SKIP) days correctly produce no backup. No same-spot duplicates or overlapping later-windows found. | "May fit better" on a lower score; combined with F2 gives invalid spots. | Require `backup.suitability ≥ primary − 5`; kind-specific reason text. |
| F16 | Low-Med | `run.js:49` | Hourly-only (grid down), `windSpeed:"15 to 25 mph"` | `parseFloat` yields 15, no gust (hourly has none), so the wind gate (≥25) can't fire and `conditionsReady` is false, still MAYBE. | The only fallback wind path understates. | Parse the upper bound of ranges. |
| F17 | Low | `run.js:138`, `model.js:33` | `now:"2026-10-05T12:00:00"` (no tz); spot without lat/lon | No-tz string parses in host TZ (different window than UTC). Missing lat/lon throws "Expected a date and valid latitude/longitude" and aborts the entire run; spot without `modes` throws "No scored window". | One bad catalog row kills both horizons. | Validate/skip bad catalog rows with a typed warning; reject no-tz `now`. |
| F18 | Low | `run.js:122` | Any | `headline` is "Sheepshead morning window": no verdict word, no spot (spot is in `displayName`), no species-vs-setup tie. Fine as a coded field but the formatter gives no GO/MAYBE/SKIP string. | Front-end must reassemble the 10-second answer. | Add `formatVerdictLine(run)` e.g. "MAYBE — Sheepshead at Vilano Bridge, 9–10 AM". |

## Statistical review (real history)

Data: ocean n=931 (pier/dock 812 = 87%, beach/bank 91, jetty 17, bridge 11; Duval 506, Flagler 346, St. Johns 70, Nassau 9). Inland n=1,742 (Duval 1,043 = 60%, Nassau 337, St. Johns 262, **Flagler 100 = 5.7%**; beach/bank 907, pier/dock 538, bridge 131).

Monthly n (ocean): Jan 43, Feb 37, Mar 72, Apr 120, May 78, Jun 113, Jul 197, Aug 146, **Sep 19, Oct 33**, Nov 41, Dec 32. Only 4 of 12 months reach the n≥80 "numeric" cutoff; the current month (Oct) is n=33.

Five concrete species-month examples (rate = shrunk, from `getHistoricalTiming`):

1. **Inshore sheepshead, Oct**: 4 hits / 154 trips, shrunk 0.022, band Rare, **season 1.0** because it is the species' peak. Suitability 96, "Great fit", headline driver (F5). Peak is 4 trips.
2. **Surf pompano, Oct vs Nov**: Oct 8/33 (raw .242 → shrunk .145, "Occasional", season 1.0); Nov 1/41 (raw .024 → shrunk .067 "Occasional", season .46). With kMonth=40 against n=33–41, shrinkage replaces more than half the signal, so a 2.4% raw month is reported as 6.7% and keeps the "Occasional" band.
3. **Surf bluefish, Oct**: 8/33 raw .242 would be "Common"; shrunk .193 → "Occasional". Nov 14/41 raw .341 → .225 "Common". The bands flip on shrinkage at n≈33–41, and copy shows the shrunk number as a survey fact.
4. **Surf Spanish mackerel, Apr/Jul/Aug**: Apr 4/120 (.033 → .025, season 1.0), **Jul 0/197, Aug 0/146**. Max rate all year 0.025 ("Rare" in every month), yet `staug-pier` and `flagler-pier` list Spanish as a pier target and it appears in the species picker. The model scores it 20 (out-of-season cap) in October, plausible, but a pier angler expecting Spanish in summer will see "Rare" every month and a zero summer.
5. **Inshore redfish, Oct/Nov**: Oct 7/154 (.045 → copy "Fewer than 1 in 10"), Nov 7/116 (.060 → .053 → copy **"About 1 in 10"**, `round(10×.053)=1`, double the rate; `copy.js:90`). No inshore species reaches "Common" (max: mangrove 0.151, trout 0.083).

Structural weaknesses:

- Rates are unconditional per-trip rates (not per targeted trip), so they mix angler intent and effort; the inland bucket is dominated by Duval/Nassau river and bank anglers (catfish/panfish keys exist) and deflates saltwater species. Low rates are then used as the eligibility floor, a use the data doesn't support.
- Mode mismatch: surf spots (Vilano Beach, Beverly Beach, Marineland rocks, Matanzas surf) use a bucket that is 87% pier/dock trips and Duval-heavy. Copy discloses "pier and beach surveys" (`history.js:5`, `copy.js:86`) but not the 87% pier share or that Flagler is 6% of the inshore sample. Partial disclosure only.
- Eligibility with floor 0.05 would drop 19 of 72 inshore location-months to "no realistic target" (`coverage-v5` reports 23 cells without a realistic target, 53/72 inshore with one), including every St. Johns/Flagler inshore cell in months where no species reaches 5%. The floor needs a data-driven revisit, not just a number.

## What a user actually sees on a perfect day

Fixture 2026-10-05 08:00 ET, `generate-v5 --fixtures`:

```
verdict: MAYBE   (GO threshold is null, so GO is structurally unreachable)
headline: "Sheepshead morning window"      whenLabel: "Today morning · 9–10 AM"
useLine:  "Tight to pilings, bridge fenders, docks and rocks."
reason:   "Survey history or spot coverage does not support a realistic target."
confidence: "High confidence · 80 · Tide timing is unavailable"
targets:  sheepshead 96 Great fit [rare]  – "Fewer than 1 in 10 Northeast Florida shore fishing trips caught one in October (2015–2025 surveys); river, bridge and bank surveys."
          mangrove 92 Great fit [rare]   blackdrum 91 Great fit [rare]
backup:   other-mode → vilano-beach / surf / sheepshead  MAYBE ("A nearby alternative may fit better.")
tomorrow: identical (MAYBE sheepshead Vilano Bridge, 9:30–10:30)   comparison: "similar"
days 3–7: Promising ×5 (conf 35)
```

Reading this as an angler: "MAYBE, Great fit, but the survey says this isn't a realistic target, backup is sheepshead on a sandy beach." Reads as broken. High confidence at 80 is the engine's ceiling because tide is permanently missing (F10), yet it is labelled "High". Under the *candidate* thresholds in `coverage-v5.mjs` (GO ≥ 70, floor 0.05) the opposite problem: the end-to-end screen reports GO in 24/24 pier, 63/72 surf and 33/72 inshore location-months on a perfect day, i.e. a GO threshold of 70 does not discriminate (the script is explicit that this is not acceptance). The 60-day replay gate has not been run. The threshold sheet's candidate set needs to be validated against F2/F7 behaviour first, because those currently inflate suitability.

Tomorrow-vs-today comparison: logic is coherent (tier first, then ±5), no incoherence found; at 7:45 pm today reads `worse`/tomorrow `better` correctly. Backups: no same-spot duplicates, no overlapping later-windows, none for a SKIP day; incoherence is limited to F2/F15.

## Robustness results (observed)

| Case | Result |
|---|---|
| Each source dropped individually (8 kinds) | Valid run, `partial`, confidence lowered. |
| All dropped / `observations: []` | Valid run, `degraded`, MAYBE, suit 100 (F4). |
| `values:null` on ok obs, `values:"garbage"`, string-numbers, NaN, null grid values, null `locationId`, `null`/`42` entries | No crash, no poison. |
| Location without a `tide` field | Valid run, tide unavailable. |
| Spot without lat/lon, spot without modes | Throws, aborts both horizons (F17). |
| DST: Oct 31 18:00 EDT, Nov 1 08:00 EST, Mar 13/14 2027 | Valid, windows sane. |
| Midnight: 23:59 ET | **Throws** (F6). 00:01 ET works. |
| Determinism | Tests pass; two builds byte-identical. |
| Copy | No "chance/probability/guaranteed/anglers" in copy; "trips" used; `calibratedProbability` is a null contract field only. |
| Payload size | today 105 KB gz, tomorrow 112 KB gz (limit 250 KB); 28 details. |

## Product drift

Not yet a weather dashboard, but drifting toward engineering showcase in the payload and copy: 488 candidates, a 9-factor breakdown, 15-item confidence line with internal kind names, per-source freshness with minute ages, and a "Great fit" band on every candidate, including ones the same record tags `rare`. The 10-second answer (verdict, species, spot, window) is present as fields but is contradicted by the `reason` line (F3) and the target list (F2, F14). Priority is to make the *top card* internally consistent, not to add more output.

## What held up

- Determinism, schema validation, byte-identical rebuilds, canonical hashing.
- Failure containment: per-source degradation lowers confidence and the run stays valid; carry-forward keeps original ages; malformed upstream JSON does not poison a run.
- Thunder SKIP gate works end to end (probability ≥ 50% or "thunder" in hourly text): SKIP, `gates:["thunder"]`, no backup, reason correct.
- Wind ≥ 25 / gust ≥ 35 and surf > 2.5 m gates are wired (the issue is the cliff, F7).
- DST handling and tomorrow-vs-today comparison.
- Copy vocabulary: "trips", low-sample bands, mode labels, no probability language.
- Eligibility *classification* itself is correct (off-list / no-structure / bycatch counts are right); it is just not enforced downstream.

## Fixes suitable for Luna High (ordered)

1. **F1**: fix alert matching (`event` list, expiry window); add a test using real adapter-shaped alerts (Tornado/Gale/High Surf).
2. **F2 + F14 + F15**: apply eligibility to `tieCandidates`, `orderTargets`, `chooseBackup`, per-species focus; floor target list; backup must be ≥ primary − 5 with kind-specific reason; add tests for "no off-list/no-structure species in targets or backups".
3. **F3**: set provisional `realisticFloor` 0.05 (update `validateParams`); build `reasonFor` from caps → gates → confidence; fix "capped" wording.
4. **F4**: cap suitability by available-weight share; distinct no-live-data headline/reason; band requires realistic eligibility.
5. **F5**: absolute-rate-aware season (min hits for peak, cap relative season by absolute rate); regression test: inshore sheepshead Oct must not outrank species with ≥ 5% rate.
6. **F6**: always build tomorrow; add a "closed today" shape; non-zero exit/log on swallowed build errors.
7. **F7**: soft caps for rain/thunder probability, wave height and onshore wind/gust; tests at 24/33 mph, 2.4 m, PoP 90%, thunder 45%.
8. **F8**: null pressure when the slot is > 1 h past the newest observation.
9. **F9 + F10**: regenerate the run fixture from real adapter shapes (hilo tide, named-array grid); implement bracketing-interpolated tide before unsetting the scale.
10. **F11, F12, F13**: planner label from real rates; freshness from `issuedAt`; emit the water-temperature source and `tideDistanceMi`.

Escalate to Claude/owner (not Luna): the realistic-floor and GO threshold values, and whether unconditional per-trip rates should gate eligibility at all (product/statistics judgment).
