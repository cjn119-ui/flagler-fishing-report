# V5 architecture red team

**Reviewer:** Claude Opus 5.5 (High), review only, 2026-10-05. **Reviewed:** `docs/v5-architecture-decisions.md` (ADR), `docs/v5-spec.md` §Architecture–§Definition of done, against `docs/v5-product-decisions.md`, `docs/data-qa-mrip.md`, `site/v5/spots.js`, `site/v5/species.js` and `site/v5/data/first-coast-history.json`.

## Verdict

**Rework ADR §2 (history math), §3 (thresholds and replay) and §8 (persistence). Ship §1 and §4–§7, §9 with the changes below.**

The core is right: one engine, one run contract, copy owned by the engine, suitability kept apart from confidence, and the builder repair. The problems sit where the design meets the data. The history thresholds were set against pre-repair rates that will move several-fold. Prevalence is counted three times, so most inshore targets are hard-capped at 20. The launch replay has no data to run on. Nothing stores predictions, so the calibration schema has nothing to join to. Meanwhile effort went into a Supabase as-of join that won't run for months.

**What can start now:** A1 (contracts, copy) and A2 (sources). **What waits:** the A3/A4 threshold work waits for step 0 and the threshold sheet (H1).

## Findings

Data cited: overall personal species shares in the current artifact (pre-repair, `ocean n=936`, `inland n=1,767`).

| # | Sev | Section | Problem | Fix |
|---|---|---|---|---|
| H1 | High | ADR 2, 3; Factors | **Thresholds are set on the wrong scale.** The current personal any-catch rate is .13 ocean / .11 inland. The repair adds individually reported B1/B2 when `F_BY_P==8`. QA finds 1,107 positive trips that are single-contributor `CATCH=2, F_BY_P=8`, so repaired rates will likely sit nearer the .63/.44 group-inclusive level. Every history constant is calibrated to the old scale: the 0.20 season ceiling, the 0.02 hard cap, the 0.05 floor, the band cuts and the "0.2 in 10" illustration. | Put every history threshold in one exported `MODEL_PARAMS`, with values for the k priors, floor, band cuts, GO threshold and season cap. Hash it into the run. Set the values only after step 0. Base them on a published **threshold sheet**: shrunk rate by species × mode × month, with n and hits. Don't hard-code any number in `factors.js`. |
| H2 | High | ADR 2 season factor; Factors hard cap; ADR 3 | **Prevalence is counted three times:** in the absolute season score, in the cap to 20 when rate <0.02, and in the 0.05 GO floor. With today's data, inshore redfish (.011), black drum (.013) and sheepshead (.0045) are capped at 20 in most months. The Targets card would read "Redfish 20 · Not a fit" at Bings Landing, which is false and absurd to locals. Suitability turns into a popularity ranking that conditions barely move. | The season factor should measure **timing**: shrunk monthly rate ÷ that species' highest shrunk monthly rate in that mode. Shrinkage already fixes the noisy-peak problem that motivated the change. Apply the cap to 20 only when relative season is <0.1. Prevalence lives **only** in the realistic-target gate and the history line. |
| H3 | High | ADR 3 | **Inshore may never GO.** Pre-repair, no inshore-valid species reaches 0.05 in the inland data. The top inland name is Southern kingfish (.033), but it maps to whiting, which is surf/pier only. That leaves 6 of 14 location-modes as permanent MAYBE. | Add a coverage test on the threshold sheet. For each active location × mode × month, list the realistic targets. If a mode has none in at least half the months, either set a per-mode floor or get an explicit owner decision that it can't GO. Add the test to the Definition of done. |
| H4 | High | ADR 3; Tests; DoD 4 | **The replay has no data.** No fixtures or archive exist in the repo, `site/api/` is regenerated and gitignored, and NWS forecasts can't be retrieved after the fact. Synthetic inputs are correctly banned, so the gate either blocks launch for about 2 months or invites fabricated fixtures. "≥60 days" allows 60 days from one season, while season + water carry 42% of the weight. | (a) **Start recording now.** Each scheduled build archives its normalized input bundle plus a compact run summary, deduplicated daily, to a data branch or an Actions artifact. (b) The launch gate becomes a **full-year hindcast** from real archived observations: NDBC 41117 waves/water temperature, a coastal C-MAN station for wind, gust and pressure (SAUF1, verify), CO-OPS predictions and computed astro. Treat the observations as perfect forecasts and alerts as checked with none active, and label the result "hindcast". (c) Rerun on recorded days once there are ≥60, spread across months. |
| H5 | High | ADR 8 | **Nothing stores predictions.** `today.json` is overwritten every 30 min and the migration is never applied. When outcome logging starts there will be no past runs to join against, so the calibration design is decorative. | Make the H4 archive the v5 persistence: immutable run id, `MODEL_PARAMS` hash, and compact location × mode × species × window projections. Keep the SQL as a draft. Cut the offline as-of-join algorithm to one paragraph until a logging UI exists. |
| H6 | High | ADR 2 low sample; ADR 5 | **Kish `effectiveN` doesn't fit an unweighted estimator, and it hides the number almost always.** Kish/n ≈ .44 ocean and .40 inland. Reaching 80 then needs a monthly n of about 180 ocean (only July) or about 200 inland (no month). The confidence history penalty inherits this: −15 in 7 ocean months. Kish measures the variance of the *weighted* estimator, but ADR 2 deliberately uses the unweighted one. | Base `lowSample` and the confidence history reason on **unique non-proxy interviews** in the mode × month slice. With n <80, the band shows for ocean Jan–Mar and Sep–Dec, and never for inland. Keep Kish as QA only. State explicitly that both history penalties (−15, −8) are `structural`, since the text leaves −15 ambiguous. |
| H7 | High | ADR 3, 5; Q5 | **A tomorrow ocean GO has no wave input.** Buoy observations don't forecast tomorrow. The Evening report and the reference hero ("Tomorrow morning: GO · Flagler Beach surf") can't be honest as specified. | See Q5. |
| M1 | Med | ADR 2 county residual | **The copy says "Northeast Florida", but the number is county-adjusted.** St. Johns ocean n=70 and Flagler inland n=100. County effects are confounded with site mix: Duval has 511 ocean trips, mostly piers. A single Flagler black drum hit moves `pCounty`. | Drop the county residual in v5: `historicalRate` = regional mode × month shrunk rate (Q4). |
| M2 | Med | ADR 3 tuning | **Wrong tuning knob.** "Above 35% → raise the realistic floor" changes which species *exist* for GO, not how selective GO is. Pushed far enough, GO just means "whiting day". | Tune GO frequency with the **GO suitability threshold**, decoupled from the 70 "Great fit" label. Change the floor only for coverage (H3). |
| M3 | Med | ADR 1, 6; scopeViews | **Payload size.** A full Recommendation for every location × mode × species focus, plus per-slot data for 14 location-modes, times 2 horizons, refreshed every 30 min on beach cellular. That likely adds up to MBs and a slow first paint. | Set a test-enforced budget, e.g. `today.json` ≤250 KB gzipped. Precompute Best anywhere, location × mode and regional species-focus views. Serve location × focus through the engine selector (engine code running in the client) over stored species predictions. Load L3 factor rows lazily. |
| M4 | Med | ADR 1; Contracts | **Model updates would break installed apps.** Validators reject unsupported `modelVersion`, so every weight or threshold tweak sends store-installed native apps to the error state. | Clients gate only on the `schemaVersion` major version. `modelVersion` and `paramsHash` are informational. |
| M5 | Med | ADR 1, 6; Contracts | **Time-relative copy can't live in static JSON.** "UI builds no strings" conflicts with "Updated 3 hrs ago", the stale banner, "Fish now — until 8:25 AM" and struck-through windows. "Same engine for native" is only true for a JS runtime. | `copy.js` exports pure `(run, now)` formatters that clients call. Every engine string ships as `{code, params, text}`. Record the decision: native = JS runtime (Capacitor); otherwise copy must be ported and parity-tested. |
| M6 | Med | ADR 4, 6 | **Hysteresis prior at the date roll-over is undefined.** After midnight, yesterday's `today.json` targets the wrong date. A held pick isn't explainable from the stored run. Favorite tie-breaks run client-side, so the stored Best anywhere can differ from what the user saw. | Prior = deployed run with the **same `targetDate`**: yesterday evening's `tomorrow.json` becomes the prior after midnight. Add `selection{reason: tie\|held\|switched, heldFromRunId}`. The outcome log records the displayed location × mode recommendation id. |
| M7 | Med | Spec Model windows | **Window placement is ambiguous.** "Top-species slot series": if the series takes the max over all species, a window can be placed for a non-realistic species while a different species drives GO. | Run the window search per species. The recommendation window comes from the **driver's** series. "Top species per slot" is display only. |
| M8 | Med | Spec Model slots | **The today run overlaps the tomorrow run.** It extends to tomorrow 05:00–10:00 when <3 h remain, which overlaps the tomorrow run and duplicates the 15:00 `recommendedHorizon` rule. | Drop the extension. `recommendedHorizon` covers the evening case. |
| M9 | Med | ADR 3; Model; Species | **One concept spread over seven mechanisms:** realistic, targets list, bycatch, `needsStructure`, `focusCapped`, Rare band and Also biting. Each can be implemented slightly differently. | Compute one `eligibility` enum per SpeciesPrediction in `model.js`: `realistic \| rare \| off-list \| bycatch \| no-structure`. GO driver, `focusCapped`, the Rare tag and Also biting all read it. The Rare cut equals the floor (Q1). |
| M10 | Med | ADR 8 outcomes | **The outcome schema can't support calibration.** A single `species_id` can't record a multi-species trip, what was targeted, or a targeted species not caught. Only weights are versioned. | Add `target_species_id` plus a child `catch_outcome_species(species_id, kept, released)`. Make `model_versions` store the full `MODEL_PARAMS`. Note the selection bias: users mostly log after a GO. |
| M11 | Med | Spec Product sections | **Spec drift Luna will copy:** "local shore anglers" (L177, L225); the owner-table band "about 3–5 in 10" (L32) vs Common/Occasional/Rare; generic amber copy "one input is missing" (L146) vs decision 3. The hero ("Pompano & whiting", Pompano 84 driving GO) is likely unreachable under the realistic-target rule. | Sonnet reconciles the spec before A1. Copy fixtures come from the decisions file. "Render exactly" checks the hero's shape, not its values. The L32 change needs Chris. |
| L1 | Low | ADR 2 copy | **Rounding conflict.** "Rounded to one decimal" gives "0.2 in 10", but the copy rule says nearest tenth of the rate. | Integer N = round(10 × rate). N <1 → "Fewer than 1 in 10". |
| L2 | Low | Factors effect / why[] | **"Helps" is picked by score, not contribution.** A .05-weight solunar factor can outrank tide. | Rank helps/hurts by (score − 0.5) × weight. |
| L3 | Low | Model | **Caps and the realistic-target MAYBE aren't explained.** | Add `caps[]{code,text}` and the reason code `notRealistic` ("Pompano fits, but few trips catch it in December"). |
| L4 | Low | Spots order (owner-approved) | **Within a tier, suitability is ignored.** A MAYBE 69 can sit below a MAYBE 51 because of catalog order. | Ask Chris: apply the 5-point bands within the tier before distance. |
| L5 | Low | ADR 8 | **Row volume.** Projecting every 30-min run gives tens of thousands of rows a day. | Persist on change (run hash) or once per horizon per build cycle. |

Shrinkage priors 80/40/150 are defensible as beta-binomial pseudo-counts. Integer N and bands absorb their sensitivity, so don't tune them. With M1, `kCounty` goes away.

## Answers to ADR §10

1. **Band cut points.** Apply them to the shrunk regional rate after the repair:
   - **Common ≥ 0.20** (1 in 5 trips or better).
   - **Occasional 0.05 to <0.20.**
   - **Rare < 0.05.**

   Rare/Occasional is the realistic-target floor on purpose, so Rare ⇔ can't drive GO ⇔ `focusCapped`: one concept. Do one sanity check on the threshold sheet: if more than 40% of target species × mode × month cells come out Common, raise Common to 0.30 and record it in `MODEL_PARAMS`.
2. **Sampling-frame wording.** Clear enough once three things change:
   - (a) Drop the county residual (M1), so "Northeast Florida" is literally true.
   - (b) Use a mode-specific source label: surf/pier "pier and beach surveys"; inshore "river, bridge and bank surveys".
   - (c) Add one Data & sources line: "Counts all surveyed shore trips, not only trips targeting this fish; not measured at this spot."

   A trip-targeted rate from MRIP `PRIM1` is a later option, not v5.
3. **Floor and GO band.**
   - **Floor:** 1 in 20 is the right concept but is set too early. Confirm 0.05 only after the H3 coverage test passes on repaired data.
   - **GO band:** Best anywhere GO on **15–40%** of complete, ungated days in a **full-year hindcast**. No calendar month above 70%. Each active location × mode reaches GO on ≥3% of its complete ungated days, or has an explicit owner sign-off.
   - **Knob:** the GO suitability threshold, not the floor (M2).
   - **Synthetic replay:** it can't validate the band. It measures the generator. Even a real-data replay validates only how often GO appears, never fishing accuracy.
4. **County residual / local precision.** Yes, it overstates. Drop it in v5 and use regional mode × month shrinkage. Spot-level differences should come from logged outcomes, not MRIP.
5. **Tomorrow waves.** A tomorrow ocean GO requires an actual **wave forecast**, and a current buoy observation never satisfies it.
   - **Source:** NWS gridpoint `waveHeight` for a fixed nearshore marine grid point per area. It comes from the same `api.weather.gov` service as the forecast; verify the field is populated and CORS works. The fallback is the coastal-waters zone forecast seas.
   - **No forecast:** tomorrow surf/pier is capped at MAYBE with "No surf forecast for tomorrow yet".
   - **Today:** the buoy observation (≤3 h old) still satisfies the gate.
6. **Target-card ordering.** The **GO driver is listed first.** The rest follow by suitability. Any listed non-realistic target gets a small "Rare in surveys" tag, so "Whiting 79, Pompano 84" reads as intended rather than as a bug. With a focus set, the focus species is the driver and comes first. The headline never names a species that isn't first in the card.

## Keep — do not change

- One DOM-free engine and one `buildPredictionRun` for both horizons. No client scoring, ranking or verdicts.
- `suitability` / `confidence` / `calibratedProbability: null` kept separate, with "never probability" language.
- The builder repair as defined. Individual A plus individually reported B1/B2. No group Type A. Key `(YEAR,WAVE,ID_CODE)`. Proxies excluded. Integer hits and denominators. Missing ≠ zero. Alias union per trip. No scoring validation before the repair passes.
- Live vs structural confidence reasons. The GO cap when forecast, alerts or waves are missing. Safety gates independent of focus.
- 5-point ties with the prior run passed in explicitly, never as hidden state.
- Isolated adapters with typed provenance and renormalization when a factor is unavailable. Carry-forward never refreshes a run's age.
- Outlook days 3–7 with no spot and no minute window.
- The ban on synthetic weather, and the statement that the replay is not accuracy.
- No raw forecast table. The run payload is canonical.
