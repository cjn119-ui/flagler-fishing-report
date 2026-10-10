# Flagler Fishing V5 — project state (updated 2026-10-09)

## Objective
First Coast fishing-decision PWA (St. Augustine → Flagler; surf/pier/inshore) that answers: worth fishing, where, when, what to target, what to throw. V5 lives under `site/v5/`; the root page and `/v1/`–`/v3/` are protected. Policy: `AGENTS.md`; spec: `docs/v5-spec.md`; decisions: `docs/v5-product-decisions.md`, `docs/v5-architecture-decisions.md`, `docs/v5-inshore-go-decision.md`, `docs/v5-go-definition-decision.md`.

## Where things stand
- **Live on main (deployed, Pages):** the interactive prototype at `/v5/proto/` (sample data), the V5 engine/catalogs/history under `site/v5/` (static files), generation-pipeline fix (PR #12: 26 h tide window, KFIN→KDAB→KSGJ weather fallback, NDBC 90 min guard restored). Deploy depends on live data passing `scripts/test-generated-output.mjs`; it failed transiently on stale weather/tide data before the fix.
- **Prototype UX merged (PR #21, 2026-10-09, merge 4da4b48):** live-data UX bug fixes (ended windows, scoped "Next window", Tomorrow headline, readable reason/source labels, 375 px overflow); Liquid Glass styling (only `proto.css` from `v5-wip-glass-supabase` 88910c5); polish pass; verdict ring replaced by a "verdict seal" (no suitability arc; solid outline, grey "Last known" when stale, "Ended" when a GO window has passed); adversarial review fixes (Sonnet review → Opus spec → Codex → Opus sign-off); best-times chart opens on the current hour. Presentation only: no engine, verdict, threshold or data changes. Regression tests: `scripts/test-v5-proto-ux.mjs`. Dashed outlines now mean only "outlook estimate, days 3–7".
- **Engine done and tested:** contracts, params, copy, sources/adapters, history math, astro, factors, model, run builder, generator, local archive scaffolding. Seasonal-benchmark GO rule (owner-approved 2026-10-06): GO = fit ≥ 70 AND ≥ benchmark + 4 for the location×mode and date; null benchmark caps at MAYBE.
- **Tests (all pass):** `scripts/test-v5-contracts.mjs` (11 groups), `-sources` (13), `-integration`, `-model` (62), `-run` (22), `-hindcast` (12), `test-hindcast-data.mjs`, plus the five legacy suites. Note `test-app.mjs` once failed on a time-dependent assertion (`stats` JSON containing "32") and passed again.
- **Hindcast (perfect-observation sensitivity, 2025-10-01…2026-09-30, 364 source-complete days):** headline GO 30.5% (target 15–40%), monthly max 60%, coverage passes. **Fails the 3%-per-cell floor for two inshore cells:** vilano-bridge 0.8%, bridge-of-lions 2.5%. The "absolute-only" info row duplicates the headline (likely a reporting bug). See `docs/v5-hindcast-report.md`.

## Pending owner decisions
1. The two failing inshore cells: review inputs vs request an exception (not pre-authorized).
2. Accept launch values: `goSuitabilityMin` 70, `goBenchmarkMargin` 4, realistic floor 0.05, tide scale 0.50 (all still provisional/unaccepted in `params.js` except as the approved GO rule states).
3. Benchmarks are in-sample on one year; a holdout year is needed before claiming more.
4. Archive uploads to GitHub release assets (400-day retention) are designed but NOT enabled; needs explicit go-ahead.
5. PR #11 put the full V5 branch on main; confirm that exposure (engine/history JSON are served under `/v5/`) is intended.
6. Approve dropping the ring's suitability arc (former NOTES P2-4); the seal shows verdict only.
7. Ended GO window: keep presenting the GO run (seal "Ended", next window first) or re-anchor the hero to the next window's verdict (changes selection).
8. Scores: keep bare 0–100 numbers or show bands only; does "Better than usual" need a stated baseline?
9. SKIP: show a same-day backup at another spot alongside tomorrow's option, and in what order?
10. Engine-level confidence reduction for stale data (today only the display is capped).
11. Terminology: "Suitability", "Rare in surveys", "bycatch", "Best anywhere".
12. Benchmark copy in `engine/run.js` uses a hyphen ("Fit 92 - above this spot's normal"); en dash or comma.

## Unfinished work (branch `v5-wip-glass-supabase`, pushed, NOT merged)
- Its glass styling is now on main via PR #21; do not merge this branch. Its `2fd88d5` is an older copy of pipeline fixes already on main (merging it would regress `pages.yml`/validator tests). Not yet done from the glass brief: safe-area insets, spring/pressed states, and a 393 px check (320/375/430 verified).
- `supabase/` migration draft: UNAPPLIED and UNVERIFIED (no local Postgres); a known gap is no table/FK for the shared `build_id`. Keep off main until loaded into a throwaway Postgres. No live Supabase project exists or is authorized.
- `site/v5/proto/AUDIT-design.md`, `AUDIT-deterministic.md`, `handoff.md` (stale; superseded by this file).

## Routing (owner rules, 2026-10-05/06)
No Sol in delegation. Bounded work → Codex GPT-6 Luna Low/Medium/High (XHigh only in previously allowed roles); judgment/taste → Claude Sonnet/Opus Medium; adversarial review → Claude Sonnet; deterministic checks run directly (never delegated). Launch Codex directly with `codex-companion task --write --model gpt-6-luna --effort <e> --cwd <repo> --prompt-file <f>`; verify model/effort in the session file. Never push/merge/deploy/enable Supabase without explicit approval.

## Next tasks
1. Owner decisions above.
2. Fix the "absolute-only" reporting row in `scripts/hindcast/run-hindcast.mjs`.
3. Prototype UI decisions 6–12 above; then remaining glass items (safe areas, pressed states). Design sign-off is by Opus (owner preference 2026-10-09).
4. Production V5 UI (phase B) only after the prototype is accepted; A6 migration validation in a throwaway Postgres.
