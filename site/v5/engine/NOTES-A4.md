# A4 implementation notes

## Proposed Pages workflow insertion (not applied)

Place the V5 generation step after the existing `node scripts/generate.mjs` step, using the workflow's current checkout and Node 22 setup:

```yaml
      - name: Generate V5 static API
        run: node scripts/generate-v5.mjs
        env:
          SITE_URL: ${{ vars.SITE_URL }}

  # Disabled until the owner enables the existing authorized release boundary.
  # archive-v5:
  #   if: ${{ false }}
  #   needs: generate
  #   steps:
  #     - run: node scripts/archive-v5.mjs --out .local-v5-archive
  #     - run: node scripts/archive-v5.mjs --upload # currently refuses by design
```

The archive command is a local deterministic bundle/restore scaffold. Its upload function always throws `remote archive activation not enabled`; no remote archive or workflow action is active.

## Conservative choices and unresolved A4 ambiguities

- `MODEL_PARAMS.history.realisticFloor`, `goSuitabilityMin`, and tide-rate normalization remain provisional in A3. A4 preserves those values. Therefore it does not claim GO frequency or calibrated performance; absent a tuned GO threshold, recommendations remain MAYBE/SKIP.
- The specified today and tomorrow slot ranges do not overlap. The run test compares scores for identical slot keys if an overlap is ever introduced, but the current overlap set is empty by contract.
- Location and species scope views store bounded candidate links and a materialized recommendation ID; they do not duplicate complete recommendation payloads. `run.candidates` retains compact per-window species predictions, and L3 factors/conditions live in lazy detail files.
- Targets use each species' scores over the selected driver's exact window. Per-location and focus views currently store their leading candidate recommendation IDs; the Best-anywhere recommendation is the canonical displayed recommendation.
- The normalized grid forecast's thunder probability is treated as thunder when it is at least 50%; the source contract provides a probability, while the safety gate accepts a boolean. Revisit if A2 establishes a more conservative conversion rule.
- CO-OPS tide rate is estimated from the nearest available prediction and its adjacent rows; a gap over 90 minutes is unavailable. This does not infer station distance beyond the catalog's existing metadata.
- Failed or stale source records add a typed live `sourceUnavailable` confidence reason (5 points per failed kind, once per candidate). This ensures degraded runs make the source failure visible even when A3 already considers a factor unavailable.
- A generator run where every observation fails preserves valid deployed runs fetched from `SITE_URL`; it exits non-zero if none can be seeded. A local empty-source builder can still produce a valid degraded fixture run.
- Planner days 3–7 are coarse placeholders using monthly history availability, with a neutral tide phase. They are explicitly labelled outlook and carry no spot, minute window, score or verdict.
- Archive files include sorted normalized inputs and compact immutable today/tomorrow projections with SHA-256 hashes. Reference asset snapshots, retention, compression, upload retries, and archive-before-Pages-publication remain future activation work; A4 does not change GitHub Actions.
- After 21:00 local time, A3 produces no remaining today slots. A4 currently throws rather than inventing a today window. Generator failure then retains deployed files if available; a dedicated no-today-candidate API shape remains to be specified.

## Verification notes

`scripts/fixtures/v5/run-inputs.json` is a deterministic normalized-source recording for offline builder/generator checks. It is synthetic test data, not a live observation archive and not evidence for hindcast coverage or launch frequency.

## Review fixes (F1–F18)

### Report example: perfect fixture day, 2026-10-05 08:00 ET

| | Before (adversarial review) | After (A4 review-fix parameters) |
|---|---|---|
| Recommendation | MAYBE · Sheepshead morning window · Vilano Bridge · 96 | MAYBE · Bluefish morning window · Vilano Beach · 84 |
| Confidence / reason | High · 80 · tide unavailable; “survey history ... does not support a realistic target” beside “Great fit” | Moderate · 72 · “This is a strong GO candidate, but the GO threshold is provisional; recommendation stays MAYBE.” |
| Targets | Sheepshead 96, mangrove 92, black drum 91, all tagged Rare | Bluefish 84, whiting 81, pompano 80; all realistic at this spot and mode |
| Backup / outlook | Invalid other-mode sandy-beach sheepshead; Promising ×5 | Same-spot later window with similar fit; month-rate outlook is Promising for this synthetic fixture |

### Report example: hazardous conditions

Reproducing inputs: 24 mph onshore wind, 33 mph gusts, 2.4 m surf, 90% precipitation, and 45% thunder probability. Before, the review observed MAYBE scores from 69–93 across related rough-weather cases. After, the all-spot fixture replay returns **SKIP · 49** at Vilano Beach, with “Wind, surf or rain conditions limit this window,” no targets below the fit floor, and no backup. Outlook dates overlapping the rough forecast are labelled Tough.

### Implemented

- **F1:** Versioned event/severity policy in `MODEL_PARAMS`; it matches adapter-shaped NWS event text and severity Extreme/Severe during an intersecting alert interval. No `severity: "warning"` shortcut.
- **F2/F14/F15:** Only realistic, fit-floor species may lead, appear in targets, or appear in focused recommendations. Backup candidates must be realistic, within five suitability points, and pass their own spot/mode eligibility; reasons describe the selected backup tier.
- **F3/F5:** Realistic floor is **0.05 provisional**. Reason copy follows current-data/condition/season caps before gates and confidence. Season peaks require 10 unshrunk hits and the relative season score is capped by rate / 0.20.
- **F4/F7:** Available factor share below 0.60 or absent critical conditions forces low confidence and suitability ≤49; wind, wave, rain, thunder, onshore exposure, and gust soft caps prevent high scores in hazardous conditions. The GO suitability threshold remains null/provisional.
- **F6/F17/F18:** Late-evening runs emit a validated `closed` today state while building tomorrow; unzoned clocks are rejected and malformed locations are skipped with typed notes. `formatVerdictLine` supplies verdict, species, place, and time.
- **F8–F13/F16:** Pressure is unavailable more than one hour after the latest sample; grid/hourly fallback uses the upper range bound; observation-array adapters and fixtures use contract-valid `{ rows }`; CO-OPS high/low tides produce cosine-interpolated height/rate; outlook considers monthly species rates and overlapping forecast intervals; freshness prefers issuance time and hides unavailable ages; water source and documented tide-distance disclosures are emitted.

**Still provisional:** launch realistic floor 0.05, GO suitability threshold, and tide-rate normalization scale. The documented tide-scale proposal is 0.5 ft/hr, matching the coverage screen; the tide factor remains unavailable until that proposal is reviewed. Interpolated live tide is present in timelines. The October fixture outlook's Promising ×5 follows the monthly survey rates and should not be read as a five-day forecast endorsement.
