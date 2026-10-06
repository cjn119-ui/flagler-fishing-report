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
