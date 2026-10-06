# A3 implementation notes

## Provisional parameter state

- `history.realisticFloor` remains `null` and `realisticFloorProvisional: true`; coverage applies a separate test-only `.05` candidate. The repaired sheet reports 16/228 Common ocean cells and 0/228 Common inland cells; the proposed .20/.05 cuts yield 59 Occasional + 153 Rare ocean cells, and 70 Occasional + 158 Rare inland cells. The `.05` candidate is the owner decision A starting concept (one in 20 trips), and these counts are its measured-sheet basis; it remains a coverage candidate, not an accepted floor: the inshore mode has no Common history cell, so the species-list/mode/spot crosswalk remains decisive.
- `thresholds.goSuitabilityMin` remains `null` and provisional. The coverage script substitutes 70 solely as a reachability check, matching the existing “Great fit” display boundary; no observed hindcast distribution exists to support an operational GO cutoff. Do not infer launch readiness from its synthetic favourable inputs.
- `factors.tide.rateNormalizationScale` remains `null` and provisional. The architecture requires a reviewed scale and boundary tests; the history sheet contains no current/tide-rate distribution. Tide remains present but unavailable, and available factor weights renormalize around it.
- Priors 80/40, numeric history cutoff 80, thin cutoff 30, bands .20/.05 and relative-season cap .10/20 are the architecture/threshold-sheet proposals. Confidence penalties and factor weights follow ADR Revision 2.

## History and model boundaries

- The artifact aggregates non-proxy interviews into mode/month integer counts and pre-unioned target species. `getHistoricalTiming` selects calendar month in `America/New_York` from the slot instant; season and history use the regional mode slice, never county/site estimates or proxy-inclusive values.
- The 2026-10-05 artifact is already repaired. No builder/history data was edited. The task asks for the ADR §2 arithmetic example, which is a hand-built unit fixture, not a claim about launch rates.
- `scoreSpecies` is a per-species/per-spot/mode evaluator. A4 remains responsible for the one run pipeline, all candidate enumeration, full source windows, view assembly, and contract serialization. Its GO decision requires a configured non-provisional suitability threshold, target eligibility, complete forecast/alert/wave gates, and confidence ≥50.
- Favorable coverage fixtures are deliberately synthetic and only prove score reachability: checked forecast/alerts, safe 6 mph wind with gust 8 mph, ideal water temperature, species-matched plausible seas, dry conditions, gentle falling pressure; missing tide remains renormalized. These are not hindcast or frequency results.
- The A1 Conditions shape does not yet name direction/gust/pressure-change/tide-phase fields used by factor evaluation; current evaluator accepts these optional normalized fields. A2/A4 must map provider outputs to the optional fields or add them to its contract without changing A1/A2 files in this task.

## Astronomy reference and precision

Read-only reference retrieval: 2026-10-05 from USNO Rise/Set/Transit/Twilight API, `https://aa.usno.navy.mil/api/rstt/oneday` with `coords=29.474,-81.127`; UTC offsets `-4` (summer) and `-5` (winter).

- 2026-06-21 USNO sunrise 06:25, sunset 20:27 EDT; moon upper transit 19:25 EDT.
- 2026-12-21 USNO sunrise 07:15, sunset 17:30 EST.
- USNO reports closest New Moon 2026-03-18 21:23 EDT for its 2026-03-19 query, and closest Full Moon 2026-12-23 20:28 EST for its 2026-12-21 query.

Solar calculations use NOAA's published fractional-year/equation-of-time sunrise algorithm with apparent horizon and civil-twilight zeniths; tests compare to the USNO values within 2 minutes. Moon position uses a low-precision Schlyter orbital approximation with 5-minute event bracketing and parabolic transit refinement. The 2026-06-21 Flagler moon transit differs from USNO by about 7 minutes. Moon phase is a mean synodic-month approximation; phase tests only claim one-day agreement. Local labels/time-zone presentation remain caller-owned. Moon event dates near UTC/local midnight can differ by calendar day; consumers should use instants and apply the selected display zone.

## Remaining implementation ambiguity

- The tide factor's magnitude scale is not in the reviewed parameter sheet, so no specific ft/hr-to-score conversion was invented. A positive signed tide rate is interpreted as incoming/flooding and negative as outgoing/ebbing when A2 does not provide an explicit phase.
- “Wind exposure sector” is interpreted as onshore when the wind's *from* direction is within 90° of the catalog facing direction; A2 should preserve meteorological wind-from convention.
- Alerts in the safety evaluator assume A2 has already filtered to active warnings overlapping each slot. The evaluator treats a supplied active warning as safety-gating.
- No specific moon-transit test across the winter local-date boundary was added because the pure astronomy contract takes a calendar date without an IANA zone. Current moon events are UTC instants; consumer date grouping is outside this module.

## A5 review repairs and remaining provisional coverage assumptions

- Astronomy date keys passed by the model are New York calendar dates. Lunar rise/set, upper transit, and underfoot are now searched inside that local-date interval (23/24/25 hours across DST); solunar periods are clipped to that interval. The astronomy helper still emits UTC instants for callers.
- Season availability remains the complete twelve-month curve used by the season factor/cap. `historyAvailable` separately reports whether the requested month has a valid shrunk rate and denominator; eligibility and history confidence penalties use the requested-month availability.
- The end-to-end coverage report uses test-only candidate values of GO threshold 70, realistic floor 0.05, and tide scale 0.5 ft/hr. `MODEL_PARAMS` remains provisional; this synthetic sinusoidal tide series demonstrates plumbing and reachability only. These results are not an observed frequency or hindcast.
- Browser-style smoke rewrites the core scoring module graph to self-contained ECMAScript data modules and imports it with the native module loader; all engine sources are separately checked for `node:` builtins. This does not emulate browser rendering, provider fetches, or the full V5 UI.
- A live Chromium page smoke remains unverified in this worker: no browser provider was available, and the Chrome UI bridge failed during navigation. The automated data-module import check passed, but it is not a claim of browser-rendering verification.
