# V5 GO definition decision (hard product judge)

Status: judgment for owner approval. Nothing here is applied. Branch `v5-catch-forecast`, evidence from `.cache/hindcast-out/chunk-primary-*-of-8.json` (tide scale 0.50, 06:00 builds, 361 source-complete days, hindcast-perfect-observation, assumed-clear alerts).

## 1. Verdict

A threshold alone cannot satisfy the approved gates, and the failure is a definition problem, not a scoring bug.

- "Best anywhere" is the maximum over ~400 candidates (14 spot x mode cells x species x windows). That maximum sits near the top of the slot distribution (candidate p10/p50/p90 = 20/60/79, daily max p50 = 85). It is GO on 99-100% of days at 70 and still 65% at 85.
- A threshold high enough for the band (~87-93) leaves weak cells permanently below it: flagler-icw inshore p90 = 79 and bings-landing inshore p90 = 83 can never be GO. That violates the per-spot >= 3% gate.
- So an absolute-only GO conflates "this is a fit day" with "this is an unusually good day for this place and season". Anglers read GO as the second. Today it would say GO about every day, which is false precision about rarity and trains users to ignore it.

## 2. Decision

**GO is a per-spot x mode statement judged against that cell's own normal for the time of year, with Best anywhere as a pointer to the best such cell.**

One-line rule: a candidate is GO when it is realistic, eligible and safety/confidence/freshness-clean (unchanged), its suitability >= 70, AND its suitability >= that location x mode's typical suitability for this time of year + 4 points.

- "Typical" = the cell's median daily-best suitability for the same calendar window (+/- 15 days), stored as a frozen, versioned benchmark table in `MODEL_PARAMS` (like the history rate sheet), not computed live.
- Selection is unchanged (`selectDriver`: verdict first, then suitability). With the new GO flag, Best anywhere surfaces a GO cell when any cell is GO, else the best MAYBE. The headline is therefore "some spot is unusually good today", and the card names the spot and area (distance stays visible, per approved scope text).
- Per-selected-spot scope: that spot's own GO under the same rule. A GO elsewhere appears as the approved "Best overall today" pointer only when it is at least one verdict step better.
- Species focus: the focused species' candidate uses the same benchmark (species-specific benchmark is out of scope; use the cell benchmark). Focus still cannot defeat a safety gate, and a capped focus is never GO.
- Suitability stays 0-100 "fit" and labels (Great >= 70, Decent >= 50) are unchanged. Only the verdict meaning changes: GO = fit AND above the usual for this spot/season.

Why not the alternatives:

| Option | Result | Why rejected |
|---|---|---|
| Absolute best-anywhere max (today) | 99-100% GO | Selection effect; meaningless |
| Absolute, raise threshold to ~90 | band reachable only for strong spots | icw/bings never GO; fails per-spot gate; threshold tuned to the gate |
| Best minus day-median margin | 5-12% at A80 M10 | Cross-sectional only; weak spots structurally excluded; ignores that every spot shares one buoy |
| Year-wide per-spot percentile | headline 56-70%, months 0-100% | Seasonality (season factor) makes it summer-GO, winter-never |
| Seasonal own-baseline + margin (chosen) | see section 4 | Removes selection effect and seasonality; every cell can reach GO |

## 3. Gate amendments (for owner approval; not applied)

Current wording (ADR section 3 and product-decisions): "Best anywhere GO on 15-40% of complete ungated days...; no month >70%; every active location x mode GO on >= 3% of its complete ungated days. Tune GO suitability threshold only."

Proposed amended wording:

> GO means: realistic eligibility, all safety/confidence/freshness conditions, suitability >= `goSuitabilityMin`, and suitability >= the location x mode seasonal benchmark + `goBenchmarkMargin`. Launch frequency gate, full-year real-observation hindcast: Best anywhere GO on 15-40% of complete ungated days (Best anywhere is GO when any active location x mode is GO); no month >70%; every active location x mode GO on >= 3% of its own complete ungated days; report the absolute-only share (suitability >= `goSuitabilityMin`, no benchmark) as information, ungated. Benchmarks are frozen from data not including the evaluated days when a second year exists; with a single year the result is in-sample and labelled so. `goSuitabilityMin` and `goBenchmarkMargin` are set once with documented rationale (70 = Great fit; margin = smallest value that keeps the headline inside the band), never re-tuned after seeing per-spot results, and any change creates a new model version.

Also add: "A month with 0% GO is reported, not failed; a month > 70% fails." (Report month min/max.)

Provisional threshold, floor and tide scale remain NOT accepted; this decision does not accept them. The 0.50 tide scale and floor .05 still need their own owner approval.

## 4. Minimal rule change with worked numbers

Computed from the chunk JSON (361 days, 14 location x mode cells, own-spot byLocation best, +/-15-day median baseline, in-sample):

| Rule | Headline GO (any cell) | Month min-max | Per-cell GO range |
|---|---|---|---|
| Absolute 70 (today) | 99% | n/a | 48-100% |
| 70 and baseline+3 | 46.3% | 17-63% | 7-20% |
| **70 and baseline+4** | **30.2%** | **14-60%** | **1-15% (12 of 14 >= 3%)** |
| 75 and baseline+4 | 26.6% | 7-60% | 1-15% |
| 70 and baseline+5 | 20.5% | 0-60% | 0-12% |
| 70 and baseline+6 | 13.9% | 0-50% | 0-9% |

Chosen: 70 and +4. Headline 30.2% is inside 15-40%; no month above 70% (max 60%).

Per-cell GO at +4, in order: beverly-beach surf 12, bings-landing inshore 11, bridge-of-lions inshore 3, flagler-icw inshore 10, flagler-pier pier 12, flagler-pier surf 12, marineland surf 10, matanzas inlet inshore 7, matanzas inlet surf 15, salt-run inshore 7, staug-pier pier 10, staug-pier surf 10, vilano-beach surf 12, **vilano-bridge inshore 1**.

Honest residual failure: vilano-bridge inshore 1% < 3%. Do not tune the margin to fix it; that would break the band. Report it, and either bring an owner exception for that cell or review its benchmark inputs (it sits at a 97 maximum with a high seasonal median, so the cell looks near-saturated, which is itself a scoring question, not a threshold question). The gate stays "not pre-authorized" per owner decision 2.

Caveats to state in the report: benchmark and threshold are in-sample on one year; hindcast uses perfect forecasts and assumed-clear alerts; this is a frequency sensitivity scenario, not accuracy.

## 5. Implementation spec for Luna

1. `params.js`: add `thresholds.goBenchmarkMargin` (4) and `benchmarks.goSeasonal[locationId:mode][monthDay or 15-day window]` (frozen table, hashed into `paramsHash`); set `goSuitabilityMin` = 70 only after owner approval of section 3. Validation: finite, 0-100, table complete for every active cell.
2. `model.js` line ~67: GO additionally requires `suitability >= benchmark(location, mode, date) + margin`. If benchmark is missing, cap at MAYBE with a coded reason `benchmarkUnavailable` (no fallback to absolute GO).
3. `run.js` line ~102: remove `provisionalGoThreshold` cap only when both parameters are non-null and approved; keep it otherwise.
4. Table generator: deterministic script reading the hindcast chunk JSON, writing the median of own-cell daily-best over +/-15 days, excluding safety-gated and non-source-complete days; include the generating manifest hash in the table.
5. Preserve unchanged: F5 (low-rate species cannot lead; Rare cannot drive GO), the eligibility enum, safety gates, confidence >= 50, freshness/alert/wave gates.

## 6. Tests and hindcast checks

- Unit: GO false at suitability 90 when benchmark+margin = 95; GO true at 70 when benchmark = 66; GO false at 69 regardless; boundary exactly benchmark+margin is GO.
- Unit: missing benchmark -> MAYBE with `benchmarkUnavailable`; rare/off-list/bycatch/no-structure never GO even above benchmark (F5 and eligibility); safety SKIP unaffected; focused capped species not GO.
- Unit: Best anywhere picks a GO cell over a higher-suitability non-GO cell; ties keep prior selection (no flicker).
- Params: `paramsHash` changes when the benchmark table or margin changes; validator rejects incomplete tables.
- Hindcast: report headline GO share, month min/max, every cell's GO share and denominator (zero denominators fail), the absolute-only share, and per-mode shares, for 06:00, tomorrow and 19:00 separately. Assert 15-40%, month max <= 70%, per-cell >= 3% (vilano-bridge inshore is the known failure to surface, not hide). Add a regression that rebuilds the benchmark table from the same chunks and compares the hash.
- Holdout: if any second year of source-complete data exists, build benchmarks from year A and evaluate year B; report both.

## 7. Risks and what not to do

- Do not tune threshold or margin to hit the band or to rescue one cell; the margin is chosen once with the band as a sanity check, then frozen.
- Do not claim "GO = high catch probability"; it means above the usual for that spot and season, with `calibratedProbability: null` unchanged.
- In-sample benchmarks flatter the gate; label results and prefer a holdout year.
- A seasonally relative GO can read GO on a mediocre midwinter day (suitability just 70) or MAYBE on a high-fit midsummer day. Mitigation: the absolute 70 floor, and copy that states both facts.
- Shared buoy and airport mean surf/pier cells GO together; GO shares are not independent across cells. Do not present them as separate confirmations.
- A frozen table goes stale; version it with the model and re-derive when the archive reaches the recorded-replay stage.
- Do not change selection ordering (verdict -> distance -> favourite -> catalog).

## 8. UI copy when GO is rare

- GO: "Better than usual at <Spot> today" (subline: "Fit 82 - above this spot's normal for <month>").
- No GO but a Decent cell: "No standout spot today. Best bet: <Spot>, <mode>" with verdict MAYBE.
- Do not write "GO about X% of days" or any probability.
- Selected-spot scope without GO: "Normal conditions here. <Best spot> looks better today" only when that spot is GO.
- Species focus: "Not a standout for <species> today" instead of a generic SKIP when only the benchmark fails.
