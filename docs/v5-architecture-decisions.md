# V5 architecture decisions

**Status:** Reconciled technical architecture baseline; implementation and empirical acceptance remain pending. Product meaning remains governed by `docs/v5-product-decisions.md`; unresolved product inputs are listed at the end.

## Revision 2 — 2026-10-05

**Owner-approved (Chris, 2026-10-05):** Common ≥0.20, Occasional ≥0.05 and <0.20, Rare <0.05; Rare cannot drive GO. History wording is accepted after dropping county adjustment and naming each mode's sampling source. Keep the 1-in-20 realistic-target floor only after repaired-data coverage passes. Launch frequency gate: Best anywhere GO on 15–40% of complete ungated days in a full-year real-observation hindcast; no month >70%; every active location × mode GO on ≥3% of its complete ungated days, otherwise explicit owner sign-off. Synthetic replay cannot validate this. Drop county adjustment. Tomorrow ocean GO requires an actual wave forecast; verify NWS gridpoint `waveHeight` in A2, otherwise cap at MAYBE. Targets list the GO driver first (focus first when focused), then suitability, and tag Rare targets.

These approvals supersede older technical thresholds, effective-sample wording and replay rules in the product-decisions file; its remaining product rules still govern. The Decisions table and Product spec are preserved as instructed. Their stale wording/examples are tracked under M11, not implementation authority.

| Finding | Resolution | Where |
|---|---|---|
| H1 | Resolved: repaired threshold sheet → one versioned `MODEL_PARAMS`; no rate-dependent guessed constants. | §2 threshold sheet/parameters; §9 step 0/A3 |
| H2 | Resolved: relative seasonal timing; prevalence only in history and eligibility. | §2 formula/example; spec Factors |
| H3 | Resolved: per-mode reachability and location × mode × month coverage gate. | §3 coverage; §9 A3/A5 |
| H4 | Resolved: scheduled archives and full-year observed hindcast; recorded replay follows later. | §3 hindcast; §8 archive |
| H5 | Resolved: immutable input/run archive is V5 persistence; SQL remains draft. | §8 |
| H6 | Resolved: unique-interview n gates copy/confidence; Kish QA only. | §2 sample policy; §5 |
| H7 | Resolved: tomorrow forecast waves, no current-buoy substitution. | §5/§7; spec Sources |
| M1 | Resolved: county residual removed. | §2 shrinkage |
| M2 | Resolved: frequency tuned by GO suitability threshold, not prevalence floor. | §3 |
| M3 | Resolved: gzip payload budgets, bounded precomputed views, lazy L3. | §6; spec Contracts/Static API |
| M4 | Resolved: schema-major compatibility; model version/hash informational to clients. | §1 |
| M5 | Resolved: coded copy plus pure `(run, now)` formatters; native JS runtime. | §1/§6 |
| M6 | Resolved: same-target-date prior, explicit selection provenance, displayed outcome ID. | §4/§8 |
| M7 | Resolved: per-species windows; recommendation uses driver's series. | §3; spec Model |
| M8 | Resolved: today never extends into tomorrow. | §6; spec Model |
| M9 | Resolved: one eligibility enum; all GO/focus/tag/bycatch decisions consume it. | §3; spec Contracts |
| M10 | Resolved: targeted species and multi-species catches; full parameter versions; bias warning. | §8; spec Supabase |
| M11 | Partially resolved: technical precedence/copy fixtures fixed; protected product text still requires reconciliation before B. | §1 copy authority; §9 B; spec technical requirements |

“Resolved” in this table means resolved in the architecture contract, not implemented or empirically passed. Step 0, source verification, archive activation and hindcast gates remain pending. No High or Medium finding is rejected. The proposed automatic Common-cut increase to 0.30 is rejected: the owner approved 0.20; report the sheet's Common share for review, never change that band silently. Low findings L1/L2/L3/L5 are incorporated below. L4's proposed Spots reordering is rejected for V5 because it conflicts with the approved verdict → distance → favourite → catalog order; no new owner decision is needed to retain that order.

## 1. Domain model and stable contracts

**Decision.** One engine-owned `PredictionRun` carries versioned inputs/provenance, location × mode × species predictions/windows, bounded scope views, timeline series and planner days. Morning/evening share one builder. Suitability (0–100 heuristic fit), confidence (0–100 input completeness/freshness), and `calibratedProbability: null` remain separate. No probability claim follows from either score.

| Product requirement | Canonical output |
|---|---|
| 1–2 | Headline/when/use copy, reason and timed safety gates. |
| 3–4 | Factor effects/contributions, conditions and plain labels; L3 details lazy. |
| 5–8 | Backup kind/reason/distance; history, season curve, water fit. |
| 9–10 | Location/mode views, ties, species-focus selector, overall verdict/cap. |
| 11–12 | 30-minute series; forecast days 1–2 and coarse outlook days 3–7. |
| 13–14 | Source/run freshness, missing/fallback/carry-forward, typed confidence reasons. |
| 15–18 | Comparison/horizon, display names, setup, clock-dependent window copy. |
| 19 | Required-field validation; unknown optional extensions ignored; only unsupported schema major is a compatibility rejection. |

Clients validate required types/enums and `schemaVersion` major, **never reject a run solely for an unfamiliar `modelVersion` or `paramsHash`**. Those identify the model for provenance. Required fields remain validated regardless of model version.

Every engine-authored message is `CopyMessage{code,params,text}`; `text` is the fallback generated at run creation. Keep existing headline/whenLabel/useLine/summary field names, but consistently type display messages this way in A1. `copy.js` supplies pure `(run, now)` formatters for elapsed age, stale banners, Today/Tomorrow wording, open/ended windows and countdowns. Clients call shared formatters and render results; they do not recreate strings or freeze time-relative copy at generation. All wire timestamps stay UTC; formatters use America/New_York.

**Copy authority (M11).** Fixtures come from approved product decisions and Revision 2: trips, not anglers; regional mode source labels; a named live gap rather than “one input is missing.” The protected Product spec and Decisions table contain stale copy and illustrative scores. “Render exactly” means the hero's shape and fields, not forced Pompano 84/GO values. Reconcile the protected product text before B; this is editorial alignment to already-approved decisions, not a new product choice.

Native V5 means the same JS engine/copy running in a Capacitor runtime. A future non-JS native client must port and parity-test copy/selection; identical behavior is not assumed. UI owns rendering/state, engine owns scoring, selectors, ranking, verdicts and copy.

## 2. Catch-rate definition, shrinkage, and use

### Required builder correction (step 0)

One eligible interview `(YEAR,WAVE,ID_CODE)` is one trip. Personal catch success is a joined row satisfying `(CLAIM > 0 AND F_BY_P == 1) OR HARVEST > 0 OR RELEASE > 0`. Count individually attributed Type A and individually reported B1/B2, including B1/B2 when `F_BY_P==8`; never credit group Type A (`F_BY_P==2`). `TOT_CAT` is a total check, not an attribution test. `TRIP.CATCH` is the available-for-identification flag, not complete personal catch; preserve disagreement counts as QA.

Species hits are a union of all `SPECIES[].mrip` aliases per interview; denominator is every eligible interview in that regional mode/month, including no-catch interviews. Publish integer `hitTrips/nTrips`, unrounded unweighted `p`, and `personalAnyCatchTrips/nTrips` QA. Exclude proxies (`IMP_REC==1` in trip/catch or embedded interview year != survey YEAR), report them separately with source keys. Missing/omitted slices are unavailable; zero requires explicit zero hits with a positive denominator. Ocean history supports surf/pier together; inland supports inshore. County slices may remain diagnostic but never feed predictions.

`n` means unique non-proxy interviews. `lowSample = n < MODEL_PARAMS.history.numericMinN` (80); unavailable history uses unavailable copy, not a fabricated Rare band. Both numeric copy and confidence history penalties use n. Kish `effectiveN` and WP_INT-weighted rates remain QA sensitivity fields only; missing weights do not hide an otherwise valid unweighted rate or change GO eligibility.

Sources: NOAA [survey-variable workbook](https://media.fisheries.noaa.gov/2022-06/MRIP-Survey-Variables-for-Web.xls), [MRIP handbook pp. 7–8, 16–17](https://www.fisheries.noaa.gov/s3/2023-04/MRIP-Data-User-Handbook-04-2023.pdf), [methods p. 27](https://www.fisheries.noaa.gov/s3/2024-05/MRIP-Survey-Design-and-Statistical-Methods-Updated-April-2024-508.pdf), and [downloads/grain](https://www.fisheries.noaa.gov/recreational-fishing-data/recreational-fishing-data-downloads). Legacy rates in `data-qa-mrip.md` predate this repair and cannot set model thresholds.

### Regional shrinkage and timing

For species s and history mode d, use integer hits h and unique interviews n; previous/next months wrap Dec ↔ Jan:

1. `pAnnual = hAnnual / nAnnual`.
2. `pNeighbor[m] = (hPrev + hNext + kNeighbor*pAnnual) / (nPrev + nNext + kNeighbor)`.
3. `pMonth[m] = (hMonth + kMonth*pNeighbor[m]) / (nMonth + kMonth)`.
4. `historicalRate = pMonth[m]`. **No county adjustment.**
5. `pPeak = max(pMonth[1..12])` for that same species/history mode; `seasonScore = pMonth[m]/pPeak` when `pPeak>0`. An explicitly all-zero complete curve scores 0; an incomplete/unavailable curve makes season unavailable. Clamp floating-point roundoff to [0,1].

**Worked arithmetic example, not empirical/launch data:** annual 60 hits/1,200 interviews; previous month 6/100, next 9/100, current 8/100; `kNeighbor=80`, `kMonth=40`. Neighbor = `(6+9+80*.05)/280 = .067857`; current shrunk rate = `(8+40*.067857)/140 = .076531`. If the twelve-month shrunk peak is .10, seasonScore = `.076531/.10 = .76531`. With season weight .24 its pre-renormalization contribution is .18367. Another species at monthly .015 and its own peak .02 scores .75: timing is similar despite lower prevalence. That species is Rare and cannot drive GO, but its suitability is not capped solely for rarity. This removes double-counted prevalence.

Relative season `< MODEL_PARAMS.history.seasonCapBelow` (0.10) caps suitability at `seasonCapSuitability` (20); no absolute-rate suitability cap remains. Historical prevalence appears only in the history line/band and eligibility, never again as a condition score.

Copy: Common ≥.20; Occasional ≥.05 and <.20; Rare <.05, computed from pMonth. With n<80 show “{Band} in {Month} surveys — low sample.” Otherwise integer `N=round(10*pMonth)`; N<1 says “Fewer than 1 in 10.” Never decimal “0.2 in 10” or “0 in 10.” Numeric line: “About N in 10 Northeast Florida shore fishing trips caught one in MONTH (2015–2025 surveys).” Source label surf/pier: “pier and beach surveys”; inshore: “river, bridge and bank surveys.” Data & sources: “Counts all surveyed shore trips, not only trips targeting this fish; not measured at this spot.”

### Threshold sheet → MODEL_PARAMS

Luna owns `docs/v5-threshold-sheet.md` after repair. Required header: catch-definition version, source years/URLs/cache hashes, artifact SHA-256, proxy exclusions, alias/catalog hash, shrinkage equations, proposed parameter revision. Required rows per **species × UI mode × month**, plus annual row (surf/pier must explicitly name their shared ocean slice):

| Columns | Purpose |
|---|---|
| speciesId, aliases, mode, historyMode, month/all, validMode | Mapping and shared sampling frame. |
| hitTrips, nTrips, rawRate; annual hitTrips/nTrips/rawRate | Corrected counts and unique-interview denominators. |
| neighbor hitTrips/nTrips, kNeighbor, kMonth, pNeighbor, shrunkRate, peakShrunkRate, relativeSeason | Reproducible monthly math and timing. |
| lowSample, band; proposed Common/Occasional/Rare cuts, proposed realistic floor by mode | Display and eligibility proposal with owner constraints visible. |
| eligible active locationIds, realistic targetIds per location × mode × month, months with none, mode coverage result | Catalog/structure-aware reachability; distinguish zero from unavailable. |
| proposed GO suitability threshold, proposed relative season cap/score ceiling, rationale, unresolved cells | Model proposal, not guessed launch constants. |

Procedure: (1) step 0 QA proves repaired counts and aliases; freeze artifact/hash. (2) Recompute all sheet rows from integers using priors 80/40; retain those pseudo-counts unless a documented sensitivity check establishes a defect. (3) Apply approved bands and candidate floor .05, run §3 coverage and report Common-cell share. (4) Architecture owner promotes a reviewed sheet into **one exported `MODEL_PARAMS` in `engine/params.js`**, including history priors, bands, numericMinN=80, thinMinN=30, history confidence penalties, floor, relative cap, GO suitability threshold, weights and remaining scoring/gate constants. No parallel `HISTORICAL_BAND_CUTS` or factor-local history literals. (5) A5 hindcast selects the GO threshold, freezes parameters and reruns the gate; record iterations and results.

Rate-dependent launch values remain **“set by threshold sheet”**: `realisticFloor` (candidate .05, not active until coverage passes) and `goSuitabilityMin`. Approved bands (.20/.05), n cutoffs (80/30), priors (80/40) and relative season cap (.10/20) are fixed proposals recorded in that sheet, not old absolute-rate calibration. Remove `kCounty`, absolute season ceiling .20 and absolute rate cap .02. Any floor change also requires owner approval of the Rare/realistic boundary; never invent per-mode exceptions.

Each immutable model-version record stores the full MODEL_PARAMS, parameter revision, catch-definition version, threshold-sheet/artifact/catalog hashes, code revision and notes. `paramsHash = SHA-256(canonical JSON MODEL_PARAMS)`; every run references modelVersion + paramsHash and historyHash. A parameter change creates a new model version, not an overwrite.

### Factor contract and proposed rules

`PredictionFactor` carries `{key,label,group,value,unit,score,weight,contribution,effect,humanLabel,summary,detail,source,available,limiting}`. Scores are 0–1. Map groups: season→`season`, waterTemp→`water`, tide→`tide`, light→`light`, solunar→`moon`, wind→`wind`, waves→`surf`, pressure→`pressure`, rain→`weather`. `effect` is `helps` at score ≥0.67, `neutral` at ≥0.34 and <0.67, otherwise `hurts`; mark the single lowest available factor `limiting` when its score <0.34 (tie by the factor order below). For unavailable factors, set `effect/score/contribution` null, `limiting:false`, and provide missing-input text. Available weights are renormalized per species/window; unavailable factors remain listed and do not contribute. All constants below live in MODEL_PARAMS; the tide-rate normalization scale must be explicit in the reviewed parameter record and boundary fixtures before A3 acceptance (never a hidden factor literal). preserve these proposed nine factors and weights:

Apply tide-sensitivity multipliers to its configured base weight, then for available factors set serialized `weight = normalizedWeight = adjustedWeight / sum(available adjusted weights)`, `contribution = score × weight`, and `suitability = round(100 × sum(contribution))` once. Unavailable factors have null weight/contribution. Show factor `value/score/weight` only at L3.

| Factor | Rule |
|---|---|
| `season` | Use §2 regional shrinkage: `score = pMonth[m] / max(pMonth[1..12])` in the same history mode. Complete all-zero curve → 0; incomplete curve → unavailable. Timing only; prevalence feeds history/eligibility. |
| `waterTemp` | Trapezoid using `species.waterF [min, idealLow, idealHigh, max]`: 1 in ideal band; linear to 0 at min/max. Anomaly from NDBC day-of-year climatology is explanatory only in v5. |
| `tide` | 30-minute rate and direction. `moving` uses normalized absolute rate; `incoming`/`outgoing` match direction × rate, with 0.35 floor for the opposite direction while moving; `any` = 0.7. Multiply weight by tide sensitivity high 1.3, medium 1, low 0.6. |
| `light` | `lowlight`: 1 within ±60 min sunrise/sunset, taper to 0.4 midday and 0.25 night; `day`: 1 daylight / 0.3 night; `any`: 0.8. |
| `solunar` | 1 in major period (transit/underfoot ±60 min), 0.75 minor (moonrise/set ±30 min), else 0.45; +0.1 within 3 days of new/full moon, capped at 1. |
| `wind` | 1 at ≤10 mph, linear to 0 at 25 mph; gust >30 mph scores 0. Ocean direction: offshore +0.1 for calm-surf species, onshore −0.15 for calm / +0.05 for rough. Inshore uses speed, with −0.1 along exposed fetch. Clamp 0–1. |
| `waves` | Ocean only: calm <0.6 m, moderate 0.6–1.2 m, rough >1.2 m. Species match 1, adjacent class 0.6, opposite 0.2; Hs >2 m scores 0. |
| `pressure` | 6 h change: −0.5 to −3 hPa = 1; ±0.5 = 0.8; rise 0.5–3 = 0.6; absolute change >3 = 0.4. |
| `rain` | `1 − PoP/100`; thunder is a separate safety gate. |

| Mode | Season | Water | Tide | Light | Wind | Waves | Pressure | Solunar | Rain |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| surf / pier | .24 | .18 | .14 | .10 | .10 | .10 | .05 | .05 | .04 |
| inshore | .24 | .18 | .20 | .12 | .10 | — | .06 | .06 | .04 |

Hard caps: outside species water `[min,max]` or relative season `<MODEL_PARAMS.history.seasonCapBelow` limits suitability to `MODEL_PARAMS.history.seasonCapSuitability` (proposals .10/20). No absolute-rate cap. `needsStructure` species score only at pier/jetty/bridge/dock/seawall/rocks. Bycatch can appear under “Also biting” but cannot become a target or drive GO. Keep factor values, score and weight for L3; never show weights in glance/card UI.


## 3. Scoring, eligibility, coverage and hindcast gate

Nine factors/weights remain; season now measures timing. `GO` requires driver suitability ≥`MODEL_PARAMS.goSuitabilityMin`, confidence ≥50, eligibility `realistic`, no safety gate, forecast issued ≤6 h ago, checked alerts, and horizon-appropriate ocean waves (§5/§7). Suitability label “Great fit” still starts at 70; the GO threshold is independent. Non-GO suitability ≥50 gives MAYBE, otherwise SKIP; missing required live input or low confidence caps at MAYBE, never overrides a safety SKIP.

Compute exactly one `eligibility: realistic | rare | off-list | bycatch | no-structure` per SpeciesPrediction in model.js, in this precedence: bycatch; required structure absent; not in spot targets; missing history or rate below approved floor; otherwise realistic. Missing history uses `rare` conservatively with `eligibilityReason=historyUnavailable` and no “Rare in surveys” tag/band until known. Unsupported species modes produce no candidate. Only realistic drives GO. `focusCapped`, Also biting, Rare tags and driver selection read this enum/reason, not parallel checks. Any listed target with a known Rare history band carries “Rare in surveys”, including off-list/structure-limited targets; off-list/structure limits also get their own reason. `focusCapped` means eligibility is not realistic, with the specific eligibility reason; bycatch has no focus action. Focus stays first and cannot defeat a safety gate.

Search windows **per species**, not on max-across-species slots. Compare species/window candidate verdicts, then suitability. If a realistic candidate can GO, select its own best window as driver; otherwise select the best MAYBE/SKIP candidate. Targets: driver first, remaining eligible non-bycatch species by suitability evaluated over that driver's window. Keep the driver even when it is outside the numerical top three. Per-slot top species is display only. Emit `caps[]{code,params,text}` and `notRealistic` reason for capped focused recommendations. Helps/hurts order uses signed weighted effect `(score-.5)*normalizedWeight`, not raw score.

### Windows and display outputs

Generate 30-minute slots from now through today 21:00, and tomorrow 05:00–21:00, all New York local time. For each species, find local peaks; take maximal contiguous segments within 8 unrounded suitability points of each peak. Expand short segments by the higher-scoring adjacent slot until 60 minutes, or discard if impossible. Limit long segments to the best-mean 150-minute slice containing the peak (tie: earlier). Sort by peak, mean, then earlier start; remove overlaps and expose up to four windows per species. Never cross midnight or the horizon bounds. Window suitability is the unrounded mean of that species' slot scores, rounded once after window aggregation/caps. Window confidence uses the union of applicable reasons across its inputs, each penalty once; required coverage and safety gates apply across the whole window, not just its peak. Algorithm constants belong in MODEL_PARAMS.

Recommendation confidence is its driver's confidence, not an average of targets. Target suitability is computed over the driver's window; suitability bands are Great ≥70, Decent ≥50, Poor ≥30, otherwise Not a fit. These labels do not set the tuned GO threshold. `waterFit` is cold/hot outside species min/max, ideal inside the ideal interval, otherwise ok; unavailable temperature has null state/currentF and explicit copy.

Backup order: opposite water type within `NEARBY_MILES=7` (including another cataloged mode at the same spot), later same-place/mode window, same water type at another nearby spot, then best anywhere with area named. Surf ↔ pier is not opposite water. Never below MAYBE; if none qualifies emit next-window/tomorrow option. Focus may use `other-species` only without a safety gate. Preserve each backup's actual verdict, even when better than the primary; do not clamp it to the primary (protected requirement 5 conflicts with approved decision 2). Emit kind/reason/distanceMi.

Comparison is better/worse for a verdict-tier change or >5 points; otherwise similar. Display mode only for multi-mode spots. Window midpoint determines partOfDay: dawn/sunset bands ±60 minutes (dawn/dusk), morning through 11:59 after dawn, midday 12:00–14:59, afternoon until dusk, otherwise evening. Planner days 1–2 carry forecast verdicts; days 3–7 use Promising/Mixed/Tough, partOfDay+tidePhase, no spot, minute window, suitability number or GO. Outlook uses season/tide/moon/light and daily weather. “Most promising outlook” only when both forecast days are SKIP.

**Coverage prerequisite:** sheet lists realistic targets for each active location × mode × month after mode/catalog/structure filters. Each mode must demonstrate GO on at least one ungated day using plausible measured-condition ranges and the proposed parameters. A synthetic boundary fixture may prove reachability, never frequency. If any mode has no realistic target in ≥6 months, or cannot reach GO at all, A3 parameter acceptance blocks: correct mapping/data defects first, then seek an explicit owner floor/coverage exception if needed. Do not retain .05 or quietly lower it before this check passes.

**Launch gate:** a complete calendar-year hindcast from real archived observations, initially investigate 2025. Preserve source manifests/checksums and frozen now; inject normalized input fixtures, no live fetch during replay. Use consistent dawn and evening build instants (06:00 and 19:00 New York); the primary daily statistic is the 06:00 today recommendation, with tomorrow/evening reported separately to avoid counting 48 builds as 48 independent days.

| Input | Hindcast source and treatment |
|---|---|
| Waves/water temperature | [NDBC annual archives](https://www.ndbc.noaa.gov/historical_data.shtml), 41117; verify WVHT/period/WTMP units, sentinel values and year coverage. |
| Wind/gust/direction/pressure | NDBC coastal C-MAN SAUF1 candidate; A2/A5 verify station-year fields and coverage, then freeze station mapping. If deficient, use documented nearby NOAA/NWS observing-station archives, not invented values. |
| Weather/rain/thunder | Archived NWS ASOS observations via NOAA [NCEI GHCNh](https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly); verify station IDs/fields. Observed precipitation occurrence maps to a labelled perfect-observation rain proxy (0/100), not a recovered PoP forecast. Thunder/weather missing remains unavailable. |
| Tide | [CO-OPS API](https://api.tidesandcurrents.noaa.gov/api/dev) historical-date predictions for catalog stations, GMT/MLLW/hilo, padded neighboring days; astro computed from date/coordinates. |

Observations substituted for target-slot forecasts are explicitly `inputBasis: hindcast-perfect-observation`; they are never passed off as NWS forecasts. Interpolate only bracketing valid observations ≤3 h apart; no long-gap filling, fabricated seasons or repeating one day. Missing sources stay missing. Require source-complete days on ≥80% of dates in each month before frequency acceptance; report availability, excluded/incomplete and safety-gated counts by month/mode/spot. An unavailable full-year source set blocks the gate rather than becoming a synthetic pass.

The historical-alert state is **assumed checked/none** for this scenario, labelled in the manifest, not a recovered fact. Retain observed wind/wave/thunder safety gates. A dedicated hindcast input path marks future observations as perfect forecasts, never relaxes tomorrow's production forecast gate. Assumed-clear warnings and perfect forecasts make this a frequency sensitivity scenario, not evidence of operational safety or forecast skill.

Owner acceptance: Best anywhere GO 15–40% of source-complete ungated daily recommendations over the full year; no month's corresponding GO share >70%; each active location × mode GO ≥3% of its own source-complete ungated days, or explicit owner sign-off. Report every denominator (zero is a failure, not 0%); report morning/tomorrow/evening separately. Tune **GO suitability threshold only** for frequency, with a new model version and rerun; floor changes are for coverage and require owner decision. Synthetic fixtures validate math/generator only. This gate cannot establish catch accuracy, probabilities, station-level MRIP representativeness, forecast skill or safety.

Once ≥60 distinct recorded dates spanning ≥3 months exist, rerun the same engine against actually archived inputs and report live/replayed verdicts, gaps and model-version differences. This supplements, never replaces, the full-year launch gate.

## 4. Candidate ties and best-spot hysteresis

Best anywhere compares verdict tier then suitability. Same-tier candidates within 5 points of the highest score tie (no transitive chaining); order favourite → target-list membership → catalog order. Spots retains the approved verdict tier → Near me distance when enabled → favourite → catalog order. Preserve a usable prior location + mode while tied; refresh its current driver/window. Switch when prior is invalid/gated, challenger improves >5 points, or improves a verdict tier.

The prior must have **the same targetDate and scope/focus/preferences**. Fetch both deployed files; at midnight yesterday evening's tomorrow run is today's prior. Never hold yesterday's today selection or compare across target dates. No matching prior means deterministic tie order. Builder/selector receive prior runs and preferences explicitly, with no hidden state.

Every Recommendation adds `selection{reason: tie|held|switched, heldFromRunId, priorRecommendationId, preferenceKey}`. `heldFromRunId` is non-null only for a hold; first selection uses switched with no prior. Server uses empty favourites; client engine selector may personalize ties using explicit favourites and its previous displayed same-date view. Store deterministic recommendation IDs (run + scope/focus + place/mode/window + preferenceKey) and preserve the displayed recommendation ID/location/mode/window in any future outcome record; never pretend server Best anywhere was necessarily displayed.

## 5. Confidence and safety gates

Start confidence at 100; apply each reason once, clamp 5–100. Every reason is `{code,params,text,penalty,kind:live|structural}`. Forecast missing/>6 h −25, 3–6 h −10; alerts unchecked −20; tide unavailable −20; ocean tide station >15 mi −10 structural; horizon-required ocean waves unavailable −10; water temperature missing −10; inshore buoy temperature −5 structural; pressure missing −5; history unique-interview `n<30` or unavailable −15 **structural**, otherwise `n<80` −8 **structural**. Kish never enters confidence. History thresholds/penalties come from MODEL_PARAMS. High ≥75, Moderate ≥50, Low <50.

GO additionally needs a forecast issued ≤6 h ago with target-window coverage, checked alerts, and ocean waves: **today** buoy/fallback observation ≤3 h old; **tomorrow** wave forecast issued ≤6 h ago covering the full proposed window. Missing gate inputs cap at MAYBE. Observations never satisfy tomorrow waves; production has no hindcast bypass. Safety gates force SKIP: thunder, wind ≥25 mph/gust ≥35 mph, matching active NWS warning, ocean significant wave height >2.5 m; preserve time ranges. If wave forecast is a range, gate on its upper bound.

Moderate GO may carry an amber qualifier only for active non-blocking live gaps, named by shared copy (e.g. pressure unavailable). Structural reasons never produce it. Required-wave gap is a MAYBE reason, not a GO qualifier. Missing tomorrow wave forecast: “No surf forecast for tomorrow yet.” Missing today waves: “Can't confirm the surf right now.”

## 6. One pipeline, scopes, static API and UI boundary

`buildPredictionRun({now,locations,fetchImpl,history,previousRuns,preferences}) → {today,tomorrow}` fetches/normalizes once, scores both horizons identically and computes comparison. Retain the signature; internal replay injects normalized fixtures through source adapters. Today slots stop at local 21:00/date boundary; no extension into tomorrow. Tomorrow is 05:00–21:00. After 21:00 today has no remaining candidate and points to tomorrow through `recommendedHorizon`; no fabricated open window. One exported 15:00 cutoff chooses recommended horizon.

Precompute Best anywhere, each active location × mode, and regional species focus. Do **not** serialize every location × focus Recommendation. Shared `selectRecommendation(run, scope, preferences, previousSelection)` materializes those views from stored per-species/window predictions; it is engine selection, not UI scoring. Same selector in Node/browser/Capacitor; UI never recalculates factors, suitability or verdicts. Store precomputed verdicts/caps and candidate links sufficient for the selector. Timeline top species is display-only.

Budget (test-enforced actual gzip bytes): **today.json ≤250 KiB**, tomorrow.json ≤250 KiB, index.json ≤10 KiB. L3 factor rows live in lazy `details/<runId>/<locationId>-<mode>.json`, ≤100 KiB gzip each, referenced from core predictions; keep summary effects/reasons and compact species windows in core. Lazy details failing never erase the core recommendation. Pin by run ID/hash to avoid mixing builds, retain old-run details for 7 days, and cache already loaded details offline. Load only the selected horizon initially. Do not multiply complete views or full factor arrays to meet convenience requirements.

Scheduled generation runs scripts/generate-v5.mjs after scripts/generate.mjs in the existing Pages workflow (Node 22/no dependencies), reads both deployed horizons through SITE_URL and writes site/api/v5/today.json, tomorrow.json, index.json and details/<runId>/<locationId>-<mode>.json after one builder call; archives §8 in the same cycle. Source failures produce partial runs. Fatal contract/build failure preserves the validated deployed same-target-date last-valid run, original generatedAt/validity and run ID, adding attempt metadata; never refresh age or relabel yesterday as today. If no valid matching target-date run exists, fail generation rather than publish invalid output. Comparison and clock-dependent text use copy.js `(run,now)`; window countdowns/status never remain frozen at generation. UI calls shared formatting/selector APIs only.

### Required wire contracts

All timestamps are ISO-8601 UTC; local targetDate/labels use America/New_York. All display messages use CopyMessage, including nested reasons, labels, setups and accessibility text. Null/unavailable is explicit; validators do not coerce missing data to zero.

| Contract | Required fields |
|---|---|
| PredictionRun | schemaVersion, id, modelVersion, paramsHash, historyHash, catalogHash, codeRevision, horizon, targetDate, generatedAt, validFrom/validTo, region, status (ok/partial/degraded), carriedForward, missingInputs[], recommendation, scopeViews, locations[], bySpecies, slots[], days[7], inputs.sourceStatus[], notes[], detailsRefs. Carry-forward adds originalGeneratedAt/attemptedAt and failure metadata. |
| NormalizedObservation | provider, kind, locationId, station, units, observedAt, issuedAt, validFrom/validTo, fetchedAt, values (forecast intervals), ok, stale, usedFallback, safeErrorCode; irrelevant timestamps may be null. |
| Location / Conditions | Catalog fields mirrored from spots.js; location/time and wind/rain/thunder/air-water temperature/waves/tide/pressure/light/moon/alerts, labels and provenance/availability. |
| PredictionFactor | §2 factor fields; score/weight/contribution null if unavailable; summary effects in core, full rows in lazy details. |
| SpeciesPrediction | id, speciesId, locationId, mode, window, suitability/band, calibratedProbability:null, confidence/reasons, eligibility/reason, caps[], setup/useLine, historicalRate, seasonCurve[12], waterFit, detailsRef. History: nullable rate/n, month, lowSample, band (nullable when unavailable), unit:trips, sourceLabel; Kish effectiveN optional QA only. |
| FishingWindow | id, locationId, mode, UTC start/end, partOfDay, species predictions, suitability, gates[], isOpenAtGenerated, startsInMinAtGenerated, endsInMinAtGenerated. Runtime flags come from shared clock formatters. |
| Recommendation | id, scope/focus, horizon, locationId/mode/window, driverSpeciesId, verdict, suitability, displayName/modeLabel/partOfDay, headline/whenLabel/useLine, reason (required non-GO), gates[], caps[], targets[], setup, why[], limitingFactor, confidence/level/reasons/summary, amberQualifier (nullable), backup (nullable), nextOption (nullable), overall.verdict and focusCapped when focused, comparison, tiedWith[], rank, selection. Headline species equals first target; focus first. |
| Target / setup | speciesId/name, suitability/band, eligibility/reason, historicalRate, tags[]; setup: where, bait[], lures[], rig, tip. Bycatch is separate Also biting, never a target. |
| Scope/index | Precomputed Best anywhere, location×mode, regional species focus; locations include conditions/freshness/per-mode views and summary; bySpecies includes best/fitNow/focused view/overall. Local focus materialized by shared selector over core predictions. |
| Timeline / planner | Per-location/mode slots: at, suitability, tide(heightFt/rateFtPerHr/direction/phase), lightPhase, moonMarks[], topSpecies[3], conditionLabels. Days: date/kind/reason/confidence, forecast verdict/windows/topSpecies for 1–2; outlookLabel and bestWindow(partOfDay,tidePhase) for 3–7. |
| Copy / confidence / gates | CopyMessage: code/params/text; reasons add penalty/kind; gates add startsAt/endsAt/severity. selection is defined in §4. |

## 7. Observation adapters and source isolation

Adapters return typed `NormalizedObservation{provider,kind,locationId,station,units,observedAt,issuedAt,validFrom,validTo,fetchedAt,values,ok,stale,usedFallback,safeErrorCode}` with interval values for forecasts. Null times are permitted when irrelevant to that kind. Isolate failures; unavailable factors are listed/excluded and weights renormalized. Preserve provenance and source age; fetchedAt never makes an old observation/issuance fresh.

- NWS points: resolve/cache land forecastHourly, forecastGridData and observation stations separately from volatile forecasts/alerts. Metadata TTL 7 days, stale-on-error up to 30 days; hourly forecast/grid TTL 30 minutes, alerts 10 minutes, pressure observations 15 minutes. Normalize wind/direction/gust, air temperature, PoP and thunder; pressure uses up to 12 station readings for 3 h/6 h changes. Alerts checked/none != fetch failure.
- Today waves/temp: SECOORA via buoyUrls first; valid ≤3 h NDBC marine snapshot fallback. Water temperature and waves are independent; inshore ocean-buoy temperature is structural.
- Tomorrow waves: area-mapped **nearshore marine coordinate**, resolve its NWS forecastGridData and normalize `properties.waveHeight.values` ISO-duration validTime intervals/units. Do not use a land hourly forecast or treat windWaveHeight as total seas. Wave forecast freshness uses grid updateTime/issuance, not fetch time. Period unavailable removes only period-dependent output; never invent it.
- CO-OPS: catalog stations, predictions GMT/MLLW/hilo, date-range TTL 6 h, padded three-day series interpolated to 30-minute values; UTC instants, local labels via time-zone formatting; distant station vs failed fetch are separate reasons. Nearshore water-temperature station preferred when configured.
- MRIP: integer hits/denominators, repaired artifact/hash loaded once; missing != zero.

Cache keys include provider, kind, station/location and horizon/date range. Buoy responses TTL 30 minutes. Stale-on-error stays stale and cannot satisfy a GO-required input. sourceStatus records ageMinutes/stale/usedFallback/affects and safe display status. Water-temperature anomaly from NDBC day-of-year climatology is explanatory only.

**A2 wave verification:** for each active ocean area's fixed marine coordinate, record lat/lon, office/grid mapping and URL, fetch timestamp/updateTime, non-null waveHeight intervals spanning tomorrow 05:00–21:00, units and sample payload hash. Test requests from `/v5/` browser origin for CORS and from Node; retain dated fixtures. Also test null/empty/partial intervals, units, duration parsing and stale issuance. `/points` availability alone is not proof of wave availability. If no grid field exists, investigate NWS coastal-waters zone forecast seas as fallback: record zone/issuance, explicit valid interval and units, parse only unambiguous numeric seas ranges and use upper bound conservatively. Unsupported wording/coverage remains unavailable and caps tomorrow ocean at MAYBE. This verification is an implementation task, not a claim that the field works today. Official [NWS API docs](https://www.weather.gov/documentation/services-web-api) and [gridpoint fields](https://weather-gov.github.io/api/gridpoints) describe raw marine grids.

A2 also inventories hindcast station/year coverage from §3 and defines the normalized input recorder. It can capture inputs before the model is finished; missing predictions are marked pending, never fabricated. Actual scheduled recording begins with the authorized workflow integration, without waiting for Supabase or outcome UI.

## 8. Persistence, archive and migration boundary

### Launch persistence: existing GitHub release assets

Use **weekly archival releases in this existing repo**, tagged `v5-history-YYYY-Www`, outside Pages/main data files; no database/new service. Each scheduled build produces one immutable `v5-build-<UTC>-<workflowRunId>-<attempt>.tar.gz` asset. Weekly grouping stays below GitHub's [1,000-assets-per-release limit](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) at the current 48 builds/day. No upload/remote change is performed by this documentation task; workflow integration must use the existing authorized publishing boundary.

Bundle format:

- `manifest.json`: archiveSchemaVersion, build ID/attempt/time, status, code/model/params/history/catalog hashes, referenced model assets, today/tomorrow run IDs, prior selection IDs, file SHA-256 and sizes, archive errors.
- `inputs.ndjson`: one normalized provider/station/kind/interval record per distinct source, including missing/error results, issued/observed/fetched times and units; shared by both horizons. Preserve exactly what the engine used, not raw duplicate provider responses. Duplicate records hash-reference the first copy **within that build**; never reduce 48 different inputs to one daily sample.
- `runs.ndjson`: one immutable compact run per horizon: ID, versions/hashes, target date, generation/validity/status, source links, every location × mode × species × window suitability/verdict/eligibility/history/confidence/caps, compact slot scores, recommendation IDs/drivers/windows/ties/selection and scope links. Omit repeated display strings/L3 arrays; retained inputs + immutable model/code/history/catalog reconstruct them. Fatal carry-forward references the existing run ID; attempt remains distinct, not a new prediction.

Publish model-version full MODEL_PARAMS, threshold sheet, repaired history, catalogs and the exact engine/copy/adapter code snapshot once as immutable hash-named reference assets and retain as long as referenced. Upload is idempotent by asset name/hash: retry only a failed upload, never overwrite conflicting content. Verify download/hash before marking a build archived. Upload failure records a pending build artifact and fails archive acceptance; never silently drop a run while reporting persistence success. When archive integration is enabled, make verified archive persistence a prerequisite to replacing the published V5 run; root-report generation is unchanged.

Retention: 400 days of build bundles, plus pinned launch hindcast and any model/input/run assets referenced by outcomes. Older unreferenced bundles become retention candidates under an explicitly authorized retention policy; no destructive cleanup in A4. Budget: ≤256 KiB compressed per build (both horizons/input bundle), ≤12 MiB/day at 48 cycles, **6 GiB rolling archive including reference assets**; full-year worst-case build bundles ≈4.3 GiB. A4 measures real fixtures; budget overflow fails for compacting/review, never subsampling builds or deleting pinned evidence. Live payload budgets remain separate. Archives keep all scheduled builds, including changed predictions within a day; this addresses L5 without creating SQL rows at each half-hour.

### Draft SQL and future outcomes

Write one unapplied migration at supabase/migrations/20261005000000_v5_schema.sql. Tables: model_versions, locations, prediction_runs, species_predictions, recommendations, catch_outcomes and catch_outcome_species. Use UUID IDs for runs/projections/outcomes, text catalog/version keys, created_at, foreign keys and query/uniqueness indexes. Many recommendations per run; projections unique by run/place/mode/species/window or scope/focus/window. `model_versions` stores full MODEL_PARAMS and all source/code hashes; immutable prediction_runs store the canonical run/provenance once, with species_predictions and recommendations as derived projections. No redundant raw-forecast table. Future catch_outcomes records actual start/end/location/mode, nullable target_species_id (including a target not caught), displayed prediction_run_id/recommendation_id, selection snapshot and reported_via. Child `catch_outcome_species(outcome_id,species_id,kept,released)` supports multiple caught species with nonnegative counts; zero-catch trip has zero children, not an invented species. Catch totals must agree with caught flag; quantity lives in children. Constraints keep linked IDs in the same run/place/mode, and any target prediction link matches target_species_id. Missing IDs remain null with an unmatched reason. Outcome logging is selected behavior (often after GO); it cannot be treated as an unbiased catch sample.

Direct displayed recommendation links are authoritative. For an offline unlinked trip, choose latest run generated ≤actual start with matching local target date/validity and place/mode; match overlapping recommendation/target-species window by greatest overlap, then earlier start and ID. Never use a future run; keep unmatched links null and preserve reason. Detailed as-of implementation waits for a logging UI. Enable RLS with no anonymous write policies; no live project, migration application or outcome capture in this phase.

## 9. Module map and implementation sequence

Shared `engine/params.js` exports MODEL_PARAMS; contracts/copy/history/sources/astro/factors/model/run keep their existing responsibilities. The following replaces the earlier A1–A7 split:

| Step / status now | Work | Acceptance criteria |
|---|---|---|
| 0 — **in progress (Luna only)** | Catch-definition repair, regenerate history, threshold sheet. | Exact individual A/B1/B2 rule; composite joins/proxy exclusion; alias union; integer counts/unique n; QA totals/provenance; sheet has §2 columns/coverage. No scoring acceptance from legacy rates. Respect Luna's ownership of the builder, history artifact, data QA and threshold sheet. |
| A1 — **unblocked** | contracts.js, copy.js, history.js interface and params.js shape. | Stable run/message/observation/eligibility shapes; unknown optional keys/new model version accepted; unsupported schema major rejected; approved copy fixtures and `(run,now)` midnight/elapsed tests. Repaired empirical values await step 0. |
| A2 — **unblocked** | sources.js, adapters/cache, normalized recorder design and archive-source inventory. | Independent source failures; SECOORA fallback; GMT/DST; waveHeight browser/Node/coverage/issuance evidence or explicit MAYBE fallback; real hindcast station/field inventory. No claim that current buoy forecasts tomorrow. |
| A3 — **blocked on step 0 + A1/A2** | astro.js, history math, factors.js, model.js, reviewed MODEL_PARAMS. | Exact shrinkage/relative timing; no prevalence double count; per-mode realistic GO reachability/coverage passes or owner exception; eligibility/driver windows/caps/confidence/backups/ties/date-prior/selectors deterministic. Floor remains conditional until coverage. GO threshold provisional until A5. |
| A4 — **scaffolding unblocked; prediction integration waits for A3** | run.js, generate-v5.mjs, static API/details, scheduled archive integration. | One builder/two horizons; payload/detail/archive budgets; same-date priors and age-preserving carry-forward; each build's exact inputs and both immutable run projections restored/hash-verified; recorded inputs can start before threshold acceptance. Remote activation follows existing approval boundary. |
| A5 — **blocked on A3/A4 and real archive inventory** | test-v5.mjs, generated checks, full-year hindcast + later recorded replay. | All §3 annual/month/spot denominators and GO gates; ≥80% source coverage each month; parameter iteration/version record; no synthetic/accuracy claim; the five existing logic/app/catch/calculations/validator suites plus generated-output checks pass. Finalize GO threshold and rerun all gates; archive/size/copy/compatibility regressions. |
| A6 — **schema drafting unblocked; final validation waits for contracts** | One unapplied migration. | Full MODEL_PARAMS versions, canonical runs and projections; target_species_id + multi-catch children; displayed recommendation IDs/constraints/RLS; local review/parse only, no live action. |
| B — **blocked on A acceptance and product-text reconciliation** | app/UI/styles/service worker. | Selector/clock formatter usage; driver first/Rare tags; product copy reconciled to approvals, hero layout not invented model values; mobile/accessibility/offline checks. Product acceptance stays with Chris. |

## 10. Remaining owner questions

Protected text remains unchanged and must be reconciled before B (M11): Decisions-table historical wording; Product spec's anglers/generic amber wording and literal hero scores; old technical requirements 5 (backup cannot exceed primary), 6/14/15/18 (history/reason/comparison/clock shapes), and the “Open product questions” already answered in product-decisions. Approved decisions and this ADR govern implementation; owner/editor must approve edits to the protected text. Backup decision 2 requires a MAYBE-or-better backup even for a SKIP primary, so this ADR preserves its actual verdict.

Weekly release assets/400-day retention are proposed operational implementation choices, not owner authorization to upload, publish or delete. Confirm the remote archive activation boundary before A4 scheduling; recording cannot begin during this docs-only task. The proposed archive budgets and station/year coverage are acceptance work, not verified results. If the repaired .05 floor fails mode coverage, a full-year station set is unavailable, or an active spot misses the approved ≥3% hindcast GO gate, bring the measured failure and proposed exception to Chris. Do not pre-authorize changed bands/floors, weaker launch gates or alternative Spots ordering.

### Owner decisions — 2026-10-05 (Chris)

1. **Protected-text reconciliation approved.** The Decisions-table historical wording, the Product spec's anglers/generic amber wording and literal hero scores, the old technical requirements 5/6/14/15/18, and the already-answered "Open product questions" may be edited to match the approved decisions, this ADR and the product-decisions file (M11). Editor: Claude Sonnet 5.5 High. Allowed edits are limited to conforming that text; no new product decisions.
2. **Archive activation approved in principle.** Weekly release assets with 400-day retention may be implemented in A4 behind an explicit workflow switch (default off in code review until A4 acceptance). Approval covers the design only: uploading, publishing or deleting any remote release asset, pushing the branch, opening a PR, or merging to `main` (which deploys the public site) still needs Chris's separate go-ahead at that time. Exceptions to the coverage floor, full-year station set or per-spot ≥3% hindcast gate are **not** pre-authorized; bring measured failures and a proposed exception to Chris.

### Owner decision — 2026-10-06 (Chris): GO definition
Approved `docs/v5-go-definition-decision.md` section 2 and the amended gate wording in section 3: GO = realistic, eligible, safety/confidence/freshness-clean, suitability >= `goSuitabilityMin` (70) AND >= the location x mode seasonal benchmark + `goBenchmarkMargin` (4). Best anywhere is GO when any active location x mode is GO. Gates stay 15-40% headline, no month > 70%, every location x mode >= 3%; the absolute-only share is reported for information. Benchmarks are frozen, versioned, in-sample on one year and labelled so. `goSuitabilityMin`, realistic floor and tide scale remain NOT accepted by this approval except as stated for the 70/+4 rule. Vilano Bridge inshore (1%) is reported and its benchmark inputs reviewed, not tuned away and not yet excepted.
