# V5 inshore GO decision

**Status:** Judge decision (Claude Opus 5.5, Medium), 2026-10-06. Branch `v5-catch-forecast`, HEAD `037e864`. Judge-only: no engine, params or test files changed. Every number below was reproduced with `node` against `site/v5/data/first-coast-history.json`. Prototypes ran on a throwaway copy of `site/v5` outside the repo.

## Verdict

Inshore-never-GO is **mostly a scoring defect, plus one modelling error**. Thin inland data explains only the remainder, and that remainder is honest.

1. **Defect D1 (water weight is never applied, in all modes).** The factor key is `waterTemp`, but the weight key in `weightsByMode` is `water`. `factors.js:93` reads `weights[key]`, gets `undefined`, and gives water temperature a weight of 0. `model.js:127` makes the same lookup for `availableShare`. The bug has been present since `a1828fd`. The test at `test-v5-model.mjs:29` still passes, because a zero weight still sums to 1 after renormalization.
2. **Defect D2 (a thin season peak makes season *unavailable*, not low).** With `seasonPeakMinimumHits=10`, a species with no month of ≥10 hits gets `seasonScore=null`. Inland, that covers redfish (best month 8 hits), sheepshead (4) and whitetrout (5). An unavailable factor is dropped and the other weights are renormalized. Together with D1, the available share falls to 0.58, below the 0.60 minimum. Every redfish window is then capped at 49 with confidence 40, so **redfish, the flagship inshore species, can never exceed SKIP 49**. The existing F5 test `sheep.seasonScore<=.11` passes only because `null<=.11` is true in JS, so it tests nothing.
3. **Modelling error R (the F5 absolute cap uses an ocean yardstick).** The cap is `rate/0.20`, and 0.20 is the Common cut. Inland trips succeed less often overall: any-catch is 770/1742 = .442 inland against 585/931 = .628 for ocean. Their catch is also spread over more species. No inland species-month reaches .20; the best is mangrove snapper in October at .151. The cap therefore binds on every inshore species-month, and inshore season can never exceed .753.
4. **Confound, not a defect: the coverage fixture's tide is weak.** The fixture's tide amplitude is 0.25 ft/hr against the proposed scale of 0.5, so the tide score is at most .5, and only .35 in the scored slots. Inshore carries the largest tide weight (.20, ×1.3 at high-sensitivity spots), so this hurts inshore most.

**Not the cause:**
- The realistic floor: 53/72 inshore cells still have realistic candidates.
- The bands.
- The missing waves weight: inshore weights sum to 1 and renormalize correctly.

## Evidence

### Peak-slot breakdown (HEAD, candidate params GO 70 / floor .05 / tide scale .5, fixture from `coverage-v5.mjs`)

Format: score×normalized weight. Note `waterTemp …×0.000` on every row.

| Cell | Species (rate, elig.) | Season | Factors at peak slot | Binding cap | Peak / window |
|---|---|---|---|---|---|
| bridge-of-lions Oct | mangrove .151 realistic | .753 = .151/.20 (F5 cap binds; relative = 1.0) | season .75×.273, water 1.00×**0**, tide .35×.295, light .68×.136, wind 1×.114, pressure 1×.068, solunar .45×.068, rain 1×.045 | none (F5 absolute term) | 65.9 / MAYBE 64 |
| bridge-of-lions Oct | redfish .045 rare | **unavailable** (no 10-hit month) | water ×0, tide .35×.406 … | `notEnoughCurrentData` (share .58) + `notRealistic` | 49 / SKIP 49, conf 40 |
| bridge-of-lions Oct | sheepshead .022 rare | **unavailable** | — | `notEnoughCurrentData` + `notRealistic` | 49 / SKIP 49 |
| flagler-icw Oct | mangrove .151 realistic | .753 (F5 cap) | season .75×.293, water ×**0**, tide .35×.244, light .67×.146 … | none | 68.1 / MAYBE 66 |
| flagler-icw Oct | blackdrum .071 realistic | .356 = .071/.20 | same pattern | none | 58.3 / MAYBE 57 |
| salt-run Apr | flounder .025, trout .029, blackdrum .026 (all rare) | .13–.14 | same pattern | `notRealistic` | ≤55.7 / MAYBE ≤56 (no realistic target in April) |
| **vilano-beach surf Oct** (GO) | pompano .145 realistic | .724 (relative .72 binds; cap 0.725) | season .72×.293, water ×**0**, tide .35×.171, light 1.0×.122, wind 1×.122, **waves 1.0×.122**, pressure 1×.061, solunar .75×.061, rain 1×.049 | none | 79.3 / **GO 76** |

Surf clears 70 because its season terms are higher: whiting is Common, and pompano's relative score binds before the cap. Surf also gets a fixture-perfect waves factor (1.0×.122) where inshore puts that weight on weak tide and light.

### Coverage variants (end-to-end `scoreSpecies`, same fixture; GO cells / 72 or 24)

| Variant | Surf | Pier | Inshore | Notes |
|---|---|---|---|---|
| HEAD | 62 | 24 | **0** | reproduces the report |
| D1 only | 65 | 24 | 15 | **Invalid:** 12 of the 15 are redfish Aug/Nov at all six spots, scored with season *missing* (renormalized up). Sheepshead Oct rises to ~96 on a good day, which reopens F5. **D1 must not ship without D2.** |
| D1 + D2 | 64 | 24 | 3 | only mangrove Oct (vilano-bridge 70, bridge-of-lions 70, flagler-icw 72); 3 of 6 spots never GO |
| **D1 + D2 + R1 (decision)** | **64** | **24** | **8** | mangrove Oct ×3 (72–78); flounder Sep ×5 (70–72); **every inshore spot reaches GO**; ocean unchanged from D1+D2 |
| D1+D2, tide amplitude .6 ft/hr | 68 | 24 | 41 | sensitivity only |
| D1+D2+R1, tide amplitude .6 | 68 | 24 | 48 | sensitivity only |
| HEAD, tide amplitude .6 | 65 | 24 | 3 | D1/D2 dominate |

The pre-F5 figure of 33/72 came from relative-only season scoring, which put sheepshead in October at 1.0. That number is not a baseline to restore.

## Decision

**First fix defects D1 and D2. These are not optional.** Then adopt **one rule change, R1: scale the F5 absolute reference by the history bucket's own any-catch rate.**

```
pAny(bucket)  = bucket.all.personalAnyCatchTrips / bucket.all.nTrips      (integers in the frozen artifact)
absRef(bucket)= seasonAbsoluteRateCap × pAny(bucket) / pAny(ocean)         ocean: .20 exactly; inland: .20 × .4420/.6284 = .1407
rel           = rate / peak            if an eligible (≥10-hit) peak exists, else undefined
seasonScore   = clamp01( min(rel ?? +∞, rate / absRef(bucket)) )           unavailable only if curve incomplete or rate missing
```

In plain terms: a species-month counts as fully in season once it accounts for about a third (.20/.628) of the trips in that water that caught anything. Ocean results do not change at all. R1 keeps the F5 principle that a trivially rare peak cannot read as in season. It only stops measuring inland timing against the ocean's Common cut. Bands (.20/.05), the floor (.05), priors (80/40), the n cutoffs, the relative cap (.10/20) and the GO rules are all untouched, and Rare still cannot drive GO.

### Worked numbers (real data)

"Good day": flagler-icw weights, with water, wind, pressure and rain at 1.0, tide moving 1.0, light 1.0 and solunar neutral .45. That gives a non-season contribution of 72.7, and suitability = 72.7 + 24×season. The fixture column uses the coverage fixture's peak slot.

| Species-month | Rate | Season HEAD | Season D1+D2 | **Season R1** | Good day HEAD → D1+D2 → **R1** | Fixture HEAD → D1+D2 → **R1** |
|---|---|---|---|---|---|---|
| Mangrove Oct (high; 27/154) | .151 | .753 | .753 | **1.000** (relative 1.0 binds) | 88.7 → 90.8 → **96.7** | 68.1 → 73.9 → **79.8 (GO 78)** (flagler-icw) |
| Trout Dec (mid; 9/99) | .083 | .415 | .415 | **.591** | 78.9 → 82.7 → **86.9** | 57.5 → 64.7 → **68.7 (MAYBE)** (matanzas) |
| Blackdrum Nov (mid; 9/116) | .073 | .366 | .366 | **.521** | 77.4 → 81.5 → **85.2** | 58.6 → 66.1 → **69.8 (MAYBE)** (bings) |
| Redfish Nov (thin peak; 7/116) | .053 | unavailable | .267 | **.380** | 49 cap → 79.1 → **81.8** | 49 → 62.5 → **65.2** |
| **Sheepshead Oct (F5 case; 4/154)** | .022 | unavailable (test vacuous) | .112 | **.159** | 49 cap → 75.4 → **76.5**; **Rare, never GO or driver** | 49 → 60.8 → **61.9** (bridge-of-lions) |
| Surf whiting Oct (control) | .248 | .679 | .679 | .679 | 89.6 (all variants after D1) | 73.7 → 78.4 → 78.4 |

**F5 guarantee under R1.** Sheepshead's best month scores .159. That is below every realistic (≥.05) inland species-month: any species at or above the floor scores at least .355 on the absolute term, and at least .31 on the relative term, because the inland peaks are ≤ .160. Sheepshead is Rare, so the realistic-only filters (F2) keep it out of driver, targets and backups. It also stays well below what any realistic species scores under the same conditions.

## Trade-offs and what is NOT recommended

**Trade-offs accepted:**
- An inshore species-month now looks as "in season" as an ocean one at about 70% of the ocean rate. Inshore success is still lower in absolute terms, and the history line and band (Occasional, river/bridge/bank surveys) carry that honestly.
- Inshore GO stays rarer than surf GO and is concentrated in the stronger months: mangrove in Oct, flounder in Sep and, on good tide/light days, trout in Nov–Dec and drum in Oct–Nov.
- Fixing D1 raises every mode about 4–5 points whenever water is ideal and lowers it when water is marginal. The threshold sheet and coverage numbers must be regenerated.

**Not recommended:**
- **Per-mode GO thresholds or a "best inshore" GO.** GO must mean the same thing in Best anywhere.
- **Mode-relative suitability scaling,** for example rescaling inshore's maximum to 100. That invents parity of prevalence.
- **Lowering the inshore realistic floor, changing the bands, or removing the F5 cap.** Removing the cap reopens the 2.2% sheepshead peak.
- **Retuning the fixture tide amplitude or the tide weight to pass coverage.** The tide scale must be calibrated from CO-OPS predictions (A2/A5), not chosen for coverage.
- **Using catalog-wide inland peaks (catfish .160) as the reference.** That rests on one noisy cell.

## UI copy for inshore (copy codes; final text by the copy owner)

- `history.inshoreSpread` appears in the history detail for every inshore species: "Inshore catches in the surveys are spread over many species, so none is Common. A GO here means today's conditions line up in one of this species' better inshore months, not that most trips catch one." Do not show it as the headline qualifier, because it is a structural limit and not a live-data gap.
- `season.thinPeak` applies where `seasonBasis="absoluteOnly"`: "Too few survey catches to pick {species}'s best month; season uses its overall {month} survey rate."
- The season factor's detail must not show the season score as a percentage or probability. Use "Better inshore month" / "Average month" / "Off-season".
- Existing band copy is unchanged ("Occasional in October surveys"; low-sample wording when n < 80).

## A5 hindcast must check

1. Run an **ablation on the same full-year 2025 inputs and the same GO threshold**: D1+D2 against D1+D2+R1. Report the GO share per location × mode, the per-month GO share and the drivers by species-month.
2. **Owner gates as approved:**
   - Best anywhere GO on 15–40% of source-complete ungated days.
   - No month above 70%.
   - **Each inshore location × mode at ≥3%** of its own source-complete ungated days.

   The 15–40% band is a Best-anywhere gate. Per-mode GO shares are reported as a diagnostic and are not a new gate. Report the inshore share separately at 06:00 today, tomorrow and evening.
3. **Concentration check:** inshore GO must not come entirely from mangrove in October. Report each spot's GO-driving species and months, and flag any inshore spot where more than 70% of its GO days fall in one month.
4. **F5 regression in replay:** zero GO, driver or target selections for any Rare species, sheepshead included. Zero windows where season was unavailable while the curve was complete.
5. **Tide-scale sensitivity:** inshore GO is dominated by the tide scale (8 → 48 cells across fixture amplitudes). The hindcast must use the calibrated scale and report the inshore share at ±25% of that scale.
6. **Exception path:** if any inshore spot stays below 3% after a GO-threshold-only retune, bring the measured shortfall to Chris. The likeliest candidates are salt-run, bings-landing and matanzas-inlet inshore, which have no mangrove on their target lists. Propose either a per-spot owner sign-off or a MAYBE-only spot with disclosure. **Do not** lower the floor or add a mode threshold.

**Owner exception needed now?** **No.** D1 and D2 are defects. R1 changes only a review-introduced cap's reference and leaves the approved bands, floor, relative cap and launch gates alone. Record R1 in the ADR as a Revision 3 architecture entry. Inform Chris, but his sign-off is needed only if the A5 per-spot ≥3% gate fails.

## Implementation spec (Luna High)

Scope: `site/v5/engine/{factors,model,history,params}.js`, `scripts/test-v5-model.mjs`, `scripts/coverage-v5.mjs` (report lines only), `docs/v5-threshold-sheet.md` (inland reference row) and an ADR Revision 3 note. Run with the repo's `node` (≥22); the tests are `node scripts/test-v5-*.mjs`.

1. **D1, `factors.js`:**
   - Add `const WEIGHT_KEY=Object.freeze({waterTemp:"water"}); export const weightKeyFor=k=>WEIGHT_KEY[k]??k;`.
   - Use `weights[weightKeyFor(key)]` at the base-weight lookup.

   **`model.js`:**
   - Import `weightKeyFor` and use it in the `availableShare` reducer.
   - No other behavioural change.
2. **D2 + R1, `history.js` `getHistoricalTiming`:**
   - Add `absoluteReference(history,mode)`. It returns `MODEL_PARAMS.history.seasonAbsoluteRateCap` for the ocean bucket. For inland it returns `cap × (inland.all.personalAnyCatchTrips/inland.all.nTrips) / (ocean.all.personalAnyCatchTrips/ocean.all.nTrips)`. If any count is missing or non-positive, fall back to the cap (stricter) and set `seasonReferenceFallback:true`.
   - Compute `rel = peak!==null ? rate/peak : null`, `abs = rate/absRef`, and `seasonScore = complete && finite(rate) ? clamp01(rel==null ? abs : Math.min(rel,abs)) : null`.
   - Return the additional fields `seasonBasis: rel==null ? "absoluteOnly" : "relativeCapped"`, `seasonAbsoluteReference: absRef` and `seasonReferenceFallback`.
   - The relative cap at `<.10 → 20` in `model.js` stays as is. It now also applies to thin-peak species. Under R1, inshore redfish Apr scores .088 and is capped at 20; sheepshead Nov scores .117 and is not capped.
3. **`params.js`:**
   - Add `history.seasonAbsoluteReference: "bucketAnyCatchScaled"`, with `validateParams` asserting that exact enum.
   - Bump `paramsVersion` to `v5-params-a4-inshore-season`.
   - Leave `seasonAbsoluteRateCap: 0.20`.
4. **`coverage-v5.mjs`:**
   - Print a line per mode with the season basis counts.
   - Keep the fixture unchanged.
   - Add one clearly labelled sensitivity line at tide amplitude 0.6 ft/hr. It is informational only and must not drive acceptance.
5. **Docs:**
   - Add the inland `absRef=.1407` row (formula and counts 770/1742, 585/931) to the threshold sheet.
   - Add ADR Revision 3: D1, D2 and R1 with this file as the reference.

## Tests to add or replace (`scripts/test-v5-model.mjs`)

1. **Weights applied:** for each mode, call `calculateFactors` with all inputs available. The `waterTemp` weight must equal `water/Σavailable` (.18 for all modes with every input present). No available factor with a non-null base weight may have weight 0.
2. **Available share:** inshore with season unavailable and every condition present gives no `notEnoughCurrentData` cap (share .76 ≥ .60).
3. **Thin peak (replaces the vacuous F5 assertion):**
   - Inshore sheepshead Oct: `seasonAvailable===true`, `seasonBasis==="absoluteOnly"`, `0.15<seasonScore<0.17`.
   - Inshore redfish Nov: `0.37<seasonScore<0.39`.
   - Add the explicit assertion `seasonScore!==null`.
4. **Reference values:** inland `seasonAbsoluteReference` is .1407±.0005 and ocean is exactly .20.
5. **Ocean invariance:** for every ocean species × month, `seasonScore` equals the pre-change formula `min(rate/peak, rate/.20)` wherever an eligible peak exists. Pin surf whiting Oct .679±.002 and pompano Oct .724±.002.
6. **F5 ordering (real data):** in every inshore month, sheepshead `seasonScore` is below the `seasonScore` of every species with rate ≥ .05 in that month.
7. **F5 end-to-end:**
   - bridge-of-lions Oct with the favourable coverage fixture: sheepshead `eligibility==="rare"`, no sheepshead window has verdict GO, and `tieCandidates`/`orderTargets` never return sheepshead.
   - Mangrove has a GO window under candidate params (GO 70, floor .05, tide scale .5).
8. **No missing-season inflation:** for any species, a complete curve with a finite rate never yields `seasonAvailable===false`. This guards against D1 landing without D2.
9. **Coverage reachability (candidate params, fixture unchanged):**
   - Inshore GO ≥ 1 cell at each of the 6 active inshore spots.
   - Expected total 8/72; assert ≥ 6 so a small refactor does not break it.
   - Surf 64/72 and pier 24/24 must not move because of R1. Compare against D1+D2 with R1 disabled through the reference fallback.

## Risks

- **D1 is a live cross-mode change.** Water temperature starts counting (.18) everywhere, so marginal-water days drop and ideal days rise. Every published synthetic coverage figure, and the provisional GO=70 candidate, is stale until it is regenerated.
- **R1's derived reference depends on the inland any-catch rate.** That includes freshwater-leaning St. Johns trips, which may understate pAny for saltwater inshore anglers. Treat the reference as provisional with the threshold sheet, and revisit it if the catch-definition version changes.
- **Synthetic reachability is not frequency.** Inshore 8/72 rests on a weak-tide fixture. Real inshore GO frequency is unknown until A5, and it will hinge on the tide scale.
- **Concentration risk:** three spots' inshore GO currently depends on mangrove in October. The per-spot ≥3% gate may still fail for spots that do not list mangrove; that is the exception path above.
