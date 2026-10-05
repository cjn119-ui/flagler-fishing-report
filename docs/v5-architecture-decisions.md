# V5 architecture decisions

**Status:** Canonical technical architecture baseline for implementation and independent product review. Product meaning remains governed by `docs/v5-product-decisions.md`; unresolved product inputs are listed at the end.

## 1. Domain model and stable contracts

**Decision.** Use one engine-owned `PredictionRun` contract. It contains versioned inputs/provenance, all location × mode × window candidates, precomputed best-anywhere/location/species scope views, slot series, planner days, and one canonical recommendation per view. Morning and evening use the same run builder and scoring path.

Keep three values separate:

- `suitability: 0..100` is a heuristic fit score for a species, place, mode and window. It is never probability language.
- `calibratedProbability: null` stays null until outcome data support a separately calibrated model and release decision.
- `confidence: 0..100` measures input completeness/freshness and has High/Moderate/Low labels. It does not measure fish certainty.

| Product requirement | Canonical output |
|---|---|
| 1–2 | `Recommendation.headline/whenLabel/useLine`; `reason{code,text}`; `gates[]` with code/text/time/severity. |
| 3–4 | `PredictionFactor` effect/group/value/score/weight/contribution/display strings; plain labels on each `Conditions` tile. |
| 5–8 | Backup kind/reason/verdict/suitability/distance; target history; `seasonCurve[12]`; per-species/location `waterFit`. |
| 9–10 | Ranked location × mode views with ties; `bySpecies` plus species-focused views and overall verdict/cap reason. |
| 11–12 | 30-minute timeline slots; seven planner days with forecast/outlook distinction. |
| 13–14 | Run/source freshness, missing inputs, fallback/carry-forward; typed confidence reasons and summary. |
| 15–16 | Comparison delta/recommended horizon/reason; display/mode/part-of-day labels. |
| 17–18 | Structured setup plus copy; window state/countdown relative to generation time. |
| 19 | Versioned validators accept unknown optional extensions and reject unsupported required schema/model versions. |

Engine contracts own all display-ready text. A pure `copy.js` maps reason/gate/factor/window/setup codes and structured values into `headline`, `whenLabel`, `useLine`, `reason.text`, factor summaries, condition labels, confidence summaries, and accessibility labels. Native and web clients render those strings; they do not recreate them. Validators require known fields, ignore unknown optional fields, and reject unsupported schema/model versions.

**Rationale.** This covers technical requirements 1–19 while preserving one source for scoring, scope selection, copy, native clients, and the PWA. The former idea of letting each UI derive labels or rankings is rejected because clients could disagree.

**Rejected alternative.** Keep scores/copy in the web UI and translate them separately for a native app; it duplicates business rules and makes the same run read differently across clients.

## 2. Catch-rate definition, shrinkage, and use

### Decision and required builder correction

Treat one eligible interview (`YEAR`, `WAVE`, `ID_CODE`) as one trip. Keep the available-catch flag, personal trip-level catch, and species trip hits separate:

1. **Personal any-catch QA rate:** success iff that interview has a catch row with `CLAIM > 0 AND F_BY_P == 1`, or `HARVEST > 0`, or `RELEASE > 0`; count the interview once. `TRIP.CATCH == 1` is the available-catch-for-identification indicator, not the complete kept-or-released measure; retain its values as a diagnostic and flag disagreements. `F_BY_P == 8` means no available catch on the form, so it does not erase B1/B2 records. `CATCH == 3` alone is never a personal catch.
2. **Species trip-hit rate (used by both `season` and the “N in 10 trips” line):** for the mapped species' joined rows, success iff `CLAIM > 0 AND F_BY_P == 1`, or `HARVEST > 0`, or `RELEASE > 0`; denominator is every eligible interview in that mode/month (or county) slice. The first term counts individually attributed Type A; B1 (harvested/unavailable) and B2 (released alive) are reported by the intercepted individual angler and remain countable even when `F_BY_P == 8`. `TOT_CAT = CLAIM + HARVEST + RELEASE` is the total check, not a sufficient personal-attribution test by itself. For Type A group catch (`F_BY_P == 2`), do not credit that catch to the interviewee. Aggregate mapped common names as a per-trip union, not by adding rounded name-level percentages.

Builder change required before launch copy or scoring validation: replace the ambiguous `p_any_fish` / `p_any_target_fish` as launch inputs. Publish `personalAnyCatchTrips` and `nTrips` for QA, plus per-species `hitTrips`, `nTrips`, unweighted `p`, and the category/attribution definition for every `SPECIES[].mrip` union in all/month/county slices. Compute hits with the exact Type A/B1/B2 rule above, then deduplicate by `(YEAR,WAVE,ID_CODE)`; aliases form one set membership per trip. Publish `n` and Kish `effectiveN` for each eligible mode/month display slice. Test mapping parity against `species.js`. Exclude imputed rows (`IMP_REC == 1` in trip or catch data, or embedded ID interview year differs from survey `YEAR`) from primary rates and denominators; retain proxy flag/source key and report them separately in QA. Preserve trip-level `CATCH` only as `p_available_catch_yes` QA, not the general caught-one measure. Flag `CATCH==1` with no personal catch row and `CATCH!=1` with a personal B1/B2 row for audit. Never use group-inclusive Type A totals.

Use `WP_INT` only to compute the effective monthly sample size that controls the owner-approved low-sample display: `effectiveN = (sum(WP_INT))^2 / sum(WP_INT^2)` over unique, eligible interviews in that mode/month slice. If valid positive weights are unavailable, set `lowSample=true` and use a band. Keep the catch-rate point estimate and shrinkage unweighted; publish `n` as unique non-proxy interviews and `effectiveN` separately. Do not use `WP_INT` to weight the public rate, season factor, or realistic-target gate; retain weighted rates as QA sensitivity. This honors the owner-approved “effective sample <80” rule without presenting a population-weighted estimate as the share of intercepted shore trips. Use the shrunk unweighted rate for the band, with numeric band cut points centralized after Opus review.

**Rationale.** `TRIP.CATCH` is labelled for available identification/counting, while `TOT_CAT` includes A, B1 and B2. The builder must classify Type A using individual attribution and retain individually reported B1/B2, rather than treating either the availability flag or `F_BY_P==1` as the whole catch definition. Counting group Type A attributes companions' catch to the respondent; treating `F_BY_P==8` as no catch loses reported B1/B2.

**Current artifact check (not launch-ready rates):** ocean has `n=936`, legacy `p_any_fish=.1303`, legacy `p_catch_yes=.1325`, group-inclusive `.6271`; inland has `n=1,767`, `.1149`, `.1222`, `.4426`. Neither single legacy rate is the category-based personal caught-one measure defined above, and the group-inclusive rate is unsuitable. All will be recomputed after excluding proxies and publishing unrounded trip counts.

**Rejected alternative.** Use `TRIP.CATCH == 1` as the complete caught-one measure, require `F_BY_P == 1` for B1/B2 (which drops released/kept-unavailable fish), count group Type A as personal, weight the primary point rate with `WP_INT`, use raw `n` instead of the owner-approved effective-sample cutoff, or count proxies as extra interviews. Each changes the intended measure or attribution.

**Source citations.** NOAA MRIP Survey Variables workbook, `TRIP_CAL2026.CATCH` (field label “Catch Available for ID & Counting”; answers 1 Yes / 2 No / 3 catch on another person's form), `TRIP_CAL2026.F_BY_P` (1 individual / 2 other contributors / 8 no available catch on this form), `CATCH_CAL2026.CLAIM` (A), `HARVEST` (B1), `RELEASE` (B2), `TOT_CAT` (A+B1+B2), `TRIP_CAL2026.IMP_REC`, and `TRIP_CAL2026.WP_INT`: [workbook](https://media.fisheries.noaa.gov/2022-06/MRIP-Survey-Variables-for-Web.xls). NOAA [MRIP Data User Handbook (2023), pp. 16–17](https://www.fisheries.noaa.gov/s3/2023-04/MRIP-Data-User-Handbook-04-2023.pdf) defines Type A, B1, B2 and Total Catch; pp. 7–8 distinguish grouped catch and explain `WP_INT` versus `WP_CATCH`. NOAA [Survey Design and Statistical Methods (updated April 2024), p. 27](https://www.fisheries.noaa.gov/s3/2024-05/MRIP-Survey-Design-and-Statistical-Methods-Updated-April-2024-508.pdf) states B1/B2 are reported by intercepted individual anglers and distinguishes grouped Type A catch. NOAA's [downloads page](https://www.fisheries.noaa.gov/recreational-fishing-data/recreational-fishing-data-downloads) documents one TRIP record per interview and catch rows per species/trip.

### Shrinkage method

For species `s`, mode `d`, month `m`, county `c`, let `p` be the unweighted personal-trip hit share and `n` the unique interviews. Use circular neighboring months (Dec neighbors Jan):

1. `pAnnual` is the mode-wide all-month share.
2. `pNeighbor[m] = (nPrev*pPrev + nNext*pNext + 80*pAnnual) / (nPrev+nNext+80)`.
3. `pMonth[m] = (nMonth*pMonthRaw + 40*pNeighbor[m]) / (nMonth+40)`.
4. `pCounty[c] = (nCounty*pCountyRaw + 150*pAnnual) / (nCounty+150)`.
5. `historicalRate = clamp(pMonth + pCounty - pAnnual, 0, 1)`; this county residual adjusts the level while preserving the regional seasonal pattern. If a slice lacks a species count, use zero hits only when the builder explicitly emits the count; omitted/truncated is not zero.

These are v5 heuristic prior strengths (`kNeighbor=80`, `kMonth=40`, `kCounty=150`), applied to unique trip counts. Do not use rounded `.p` values as the production inputs; the builder must publish integer hits and denominators. Use the final shrunk species rate for both (a) `season` and (b) the historical line. The factor score is `min(1, historicalRate / 0.20)`; remove per-species peak-month normalization, which made any species' peak month score 1 regardless of how few trips caught it. It remains a fit heuristic, not a catch probability.

For `effectiveN < 80`, set `lowSample: true` and show only a band, using the **shrunk** unweighted rate. The contract enum is `common | occasional | rare`; numeric cut points are a product-meaning question for Opus and must be centralized in `HISTORICAL_BAND_CUTS`, not invented in the UI. `copy.js` renders “{Common/Occasional/Rare} in {Month} surveys — low sample.” For `effectiveN >= 80`, show the shrunk rate per 10 trips rounded to one decimal; if rounding would be `0.0`, say “Fewer than 1 in 10.” Copy follows owner flag B: “About N in 10 Northeast Florida shore fishing trips caught one in MONTH (2015–2025 surveys)”; surf adds “pier and beach surveys.”

**Current-file illustration (pre-repair, rounded source shares):** inland Black Drum, October: annual `n=1,767, p=.0130`; September `139,.0216`; October `154,.0260`; November `116,.0345`; Flagler county `100,.0100`. Thus `pNeighbor=(139*.0216+116*.0345+80*.0130)/335=.0240`; `pMonth=(154*.0260+40*.0240)/194=.0256`; `pCounty=(100*.0100+150*.0130)/250=.0118`; final `clamp(.0256+.0118-.0130)=.0244`, or `.244 in 10`, rounded to **0.2 in 10**. This is a method illustration only: input shares are rounded and the artifact predates proxy exclusion and builder correction; regenerate from source integer counts before validating scores or copy.

## 3. Scoring, realistic targets, and verdict-frequency gate

**Decision.** Keep the nine-factor list and per-mode weights unless replay demonstrates a defect. Retain gates and hard caps. `GO` requires a top species with suitability ≥70, confidence ≥50, no safety gate, current forecast and checked alerts, and (surf/pier) waves present. For Moderate GO, require all live gate inputs; apply the amber qualifier only to a missing/stale live input. Structural limits lower confidence but never produce that amber note.

A species may drive GO only when it is in that spot's catalog `targets` and its final shrunk historical rate is ≥0.05 (1 in 20 trips). Others remain visible in Targets but cannot drive GO. Replace peak-month normalization with the absolute-rate season score in ADR 2. Keep `calibratedProbability: null`.

Before launch, replay ≥60 distinct days (prefer a full year) from checked-in, timestamped provider fixtures recorded from the existing adapters or an archived observation set; stub every fetch and freeze `now`. Do not synthesize weather values or repeat one day's inputs. For Best anywhere, report GO/MAYBE/SKIP shares overall and on days with all gate inputs present and no safety gate. Proposed acceptance band: **15–35% GO on the ungated, gate-input-complete days**; above 35% fails and the realistic-rate threshold is raised then replayed. Below 15% also fails; first verify fixture coverage, gate status and candidate eligibility, then review scoring without automatically lowering the realistic-target floor. Also report gated/incomplete counts. This measures verdict frequency only, not fishing accuracy; no outcome claim follows from passing it.

**Rationale.** The 1-in-20 starting floor prevents an uncommon peak-month species from independently creating GO; replay checks that the selection across many candidates does not make GO routine. The historical rate remains descriptive and separate from suitability.

**Rejected alternative.** Normalize every species to its own peak month and let the maximum across all species/locations trigger GO; that makes a peak month equal 1 even when almost no surveyed trips caught that fish.

## 4. Candidate ties and best-spot hysteresis

**Decision.** Compare Best-anywhere candidates first by verdict tier (`GO > MAYBE > SKIP`), then suitability. The top candidate and every same-verdict candidate within 5 points of that top suitability form the tied set (no transitive chaining). Resolve Best-anywhere ties by user favorite, spot target-list membership, then `SPOTS` catalog order. Export the full tied set as `tiedWith[]`; do not let sub-5-point differences reorder it. The Spots list separately follows owner rule: verdict tier, then Near me distance when enabled, then favorite, then catalog order. Preserve the prior Best-anywhere `locationId + mode` while that candidate still has a usable, non-gated window; refresh its current window/driver. If the prior candidate remains in the tied set, retain it. Switch if invalid/gated, a challenger has >5 more suitability points, or a challenger has a higher verdict tier. With no prior run, use deterministic tie order. `buildPredictionRun` accepts the previous run and preferences explicitly; it has no hidden mutable state.

**Rationale.** This implements owner flag C and makes hysteresis reproducible in tests. Ranking solely by suitability × confidence is rejected because it conflicts with the approved verdict tiers and 5-point rule.

**Rejected alternative.** Sort by every raw point difference on every refresh; it creates meaningless reshuffles and loses the previously selected best spot.

## 5. Confidence and safety gates

**Decision.** Confidence is a separate completeness/freshness score with per-reason `{code,text,penalty,kind:"live"|"structural"}`. Start at 100; apply each once and clamp 5–100: forecast missing or >6 h −25, forecast 3–6 h −10; alerts unchecked −20; tide fetch missing −20; ocean tide station >15 mi away −10 structural; ocean waves missing −10; water temp missing −10; inshore buoy temperature −5 structural when used; pressure missing −5; history `effectiveN<30` or null −15, or `<80` −8 structural. High ≥75, Moderate ≥50, Low <50. Missing fresh forecast, unchecked alerts, and missing ocean waves cap verdict at MAYBE; safety gates force SKIP. Emit an amber qualifier only when the verdict is GO, confidence is Moderate (50–74), and at least one active live reason exists; its copy names a live gap. Structural reasons affect the number/reason list but never the amber live-gap note. No confidence value is described as probability or certainty about fish.

**Rationale.** It follows owner decision 3: moderate confidence can support GO only when safety-critical live inputs are present, while fixed station/sample limitations remain visible without becoming a permanent warning banner.

**Rejected alternative.** Require confidence ≥75 for every GO or emit the amber qualifier for structural limits; either suppresses viable days at affected spots or trains users to ignore a constant note.

## 6. One pipeline, scopes, static API, and UI boundary

**Decision.** `buildPredictionRun({now,locations,fetchImpl,history,previousRuns,preferences})` is called once and returns `{today: PredictionRun, tomorrow: PredictionRun}`. It fetches/normalizes observations once, builds both horizons through the same factors and candidate path, then computes their comparisons before returning. Each result has its own target date and validity interval. It precomputes Best anywhere, each location × offered mode, and each species focus; ties/preferences are resolved by an engine selector over those views. UI code reads and validates the static API/service-worker cached run, then renders a ready view; an optional live refresh calls this same builder. The UI recomputes only the visible window countdown, not prediction values, copy, rankings, or labels.

Each scheduled build calls `buildPredictionRun` once and writes its two returned runs to `site/api/v5/today.json` and `tomorrow.json`, plus a small `index.json`. Source-level failures yield partial runs. A fatal build/contract failure carries forward the deployed last-valid run with its original `generatedAt`/`validTo`, `carriedForward: true`, and a new attempt timestamp; never refresh its age by copying it. Seed tie hysteresis from both deployed horizon-specific files, matching the legacy generator's existing `SITE_URL` approach. If the browser makes a live prediction refresh, it calls this same builder and replaces a whole validated run at the API contract boundary.

**Rationale.** One computation path protects morning/evening parity and lets web/native clients use the same precomputed scopes and copy. UI renders engine-provided labels; it does not format human-facing timestamps independently.

**Rejected alternative.** Separate morning/evening pipelines or client-side prediction logic; they would drift on scoring, display strings, or failure handling.

## 7. Observation adapters and source isolation

**Decision.** Adapters return one discriminated `NormalizedObservation` contract with provider, kind, station/location, units, observed/fetched times, values, quality/stale flags and safe error code. Each provider call is isolated and never throws past the source orchestrator; unavailable factors are listed but excluded from the weighted sum, and available weights renormalize.

- NWS: cache `/points/{lat},{lon}` per location with bounded TTL; resolve hourly forecast, alerts and observation station. Cache points separately from volatile forecast/alerts. Alerts unchecked is a GO blocker.
- Waves/water: query `buoyUrls(spot.cdip)` on SECOORA first; if absent, invalid or older than 3 h, use `site/api/live/marine.json` (NDBC build copy) if valid/fresh. Preserve which source was used and each observation timestamp; for inshore buoy temperature add the structural penalty.
- CO-OPS: use each catalog station; request tide predictions in GMT and keep API instants in UTC, then convert only for display. Handle DST through instants/time-zone conversion, not a fixed offset. Cache station metadata/predictions separately with short horizon-aware TTL.
- History: load the generated history artifact once. Missing slices reduce confidence and never become zero-rate catches.

**Rationale.** Typed provenance makes freshness, fallback and factor effects inspectable while allowing one service outage to degrade a run instead of erasing all output.

**Rejected alternative.** One all-or-nothing fetch bundle or provider-specific parsing inside factors; a single timeout would erase usable inputs and couple scoring to wire formats.

## 8. Persistence and migration boundary

**Decision.** Write one unapplied migration. Version model metadata; store immutable `prediction_runs` keyed by run/version/horizon/target date; canonical `PredictionRun` payload and source provenance live once in the run. `species_predictions` and `recommendations` are queryable projections of derived results, unique by run + scope + location/mode/species/window as applicable. Multiple scope recommendations per run are allowed. Do not create a raw `source_observations`/forecast-snapshot table or duplicate weather payloads.

`catch_outcomes` stores actual session times, location/mode, optional species/quantity/gear and nullable FKs to `prediction_run`, `recommendation`, and (when a matching caught species is known) `species_prediction`. Logging from an open recommendation writes these IDs directly; composite constraints require each child link to belong to the same run and location/mode. For an older/offline outcome, select the latest run generated no later than `fished_start` whose target date equals that start's `America/New_York` local date and whose `[valid_from,valid_to)` contains the start; tie-break by run id. Within that run, match only the `scope_kind='location_mode'` recommendation for that exact location/mode whose window overlaps the actual session; if more than one overlaps, choose greatest overlap duration, then earliest window start, then id. Store the run FK even when no recommendation window matches, with an unmatched reason. If `species_id` is present, match only that species prediction in the selected run/location/mode whose window overlaps the session; use the same overlap/start/id tie-breaks. If none matches, retain any valid run/recommendation FKs and leave the species FK null with a reason. Never join a future run or fabricate a forecast snapshot. Enable RLS with no anonymous write policies. Do not create or apply a live project or migration.

**Rationale.** Immutable run versions preserve the evidence behind a prediction; direct outcome FKs are exact, and the deterministic as-of fallback supports older/offline entries without inventing links.

**Rejected alternative.** Store raw forecasts in a second table or join outcomes to the newest run at query time without checking target date, validity, place, mode, species and window; both can misattribute the outcome.

## 9. Module map and implementation sequence

| Order | Work | Acceptance |
|---|---|---|
| 0 | **Prerequisite, separate bounded data repair:** update the offline builder's Type A/B1/B2 trip-hit/effective-sample fields above; reuse the named cache if present; regenerate `first-coast-history.json`; inspect QA totals and mapping parity. | Composite-key joins; individually attributable Type A and individual-reported B1/B2 included; group Type A excluded; proxy rows excluded from primary estimates and counted separately with provenance; integer hit/denominator fields plus Kish `effectiveN`; no download when the supplied cache is absent. Freeze copy/scoring validation until it passes. |
| A1 | `site/v5/engine/contracts.js`, `copy.js`, `history.js` | JSDoc contracts and validators cover all run, source, condition, factor, species, window, recommendation, scope and planner fields; stable strings have fixture tests; unknown optional keys tolerated. |
| A2 | `sources.js` provider adapters and cache | Each adapter is independently stub-testable; stale/failure/fallback isolation works; NWS points cache, SECOORA→NDBC fallback, UTC/GMT tides and DST fixtures pass. |
| A3 | `astro.js`, `factors.js` | Pure deterministic functions; nine weights unchanged; shrinkage, factor math, normalization, caps, unavailable-factor renormalization and safety thresholds tested. |
| A4 | `model.js` | Suitability, gates, confidence, realistic GO eligibility, windows, backups, scope views, 5-point ties and prior-run hysteresis tested with edge cases. |
| A5 | `run.js` | One `buildPredictionRun` for both horizons; complete contract output from fixtures; comparison, carry-forward metadata and source freshness correct; ≥60-day verdict-frequency replay reported. |
| A6 | `scripts/generate-v5.mjs`, static files, CI validators | Emits only the three versioned v5 API files; reuses existing site generator conventions; partial source failure still yields valid run; fatal failure preserves last-valid age; generated-output checks validate schema/version/freshness. |
| A7 | unapplied `supabase/migrations/*_v5_schema.sql` | SQL covers versioned runs, prediction/recommendation projections and outcome FKs/indexes/RLS; outcome join is deterministic; no redundant forecast table; migration is reviewed or parsed locally, never applied. |
| B | `site/v5/app.js`, UI modules/styles, service worker | Starts only after A contracts/replay are stable. UI renders/filters precomputed run views and copy, and reads cache/partial/freshness state; no prediction calculations or duplicate copy. Meet the existing mobile, accessibility, offline and desktop product acceptance checks. |

**Rationale.** Each phase has an independent acceptance boundary; the outcome log cannot calibrate an engine until the builder and run contract are sound.

**Rejected alternative.** Build the UI against provisional fields or treat visual completion as proof of statistical/scoring readiness.

## 10. Open questions for Opus

- What shrunk-rate boundaries should map low-sample estimates (`effectiveN < 80`) to **Common / Occasional / Rare**? Proposed values may be reviewed, but architecture does not decide them.
- Does the approved catch-history wording make the four-county, pier-heavy ocean and inland-shore sampling frame clear enough for every species, without implying site-level representativeness?
- Is the 1-in-20 starting “realistic target” floor and proposed 15–35% ungated GO-frequency band right for the product? Treat replay as verdict-frequency evidence only.
- Does using a county residual plus regional month pattern imply more local precision than this pier-heavy, four-county MRIP sample supports? This is not fishing-accuracy calibration.
- For a tomorrow-horizon ocean GO, does “waves present” mean a fresh current buoy observation, or is an actual wave forecast required? The listed SECOORA/NDBC inputs are observations; do not imply they forecast tomorrow's surf.
- If the GO driver is not the highest-suitability target, should it displace that species in the three-row Targets card or remain separately identified as the headline driver?
