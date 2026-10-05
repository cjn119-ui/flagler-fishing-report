# PROJECT
Flagler Fishing V5 — First Coast catch-decision PWA (foundation of a future app).

## OBJECTIVE
Answer in ~10 s: worth fishing? where? when? what to target? what to throw? See `docs/v5-spec.md`.

## CURRENT PHASE
Pre-implementation. Spec drafted by Claude (out of workflow order); now running workflow steps 1–5 from `AGENTS.md`.

## CURRENT BRANCH / HEAD
`v5-catch-forecast` (local, not pushed), branched from `main` 5069c81.

## COMPLETED
- Data: `scripts/build_first_coast_history.py` → `site/v5/data/first-coast-history.json` (MRIP intercept microdata 2015–2025, Duval/Flagler/Nassau/St. Johns shore; ocean n=931, inland n=1742; NDBC 41117 water-temp climatology 2017–2025). Volusia excluded.
- Catalogs: `site/v5/spots.js` (11 active St. Aug→Flagler locations, surf/pier/inshore; 5 hidden Jax/Nassau), `site/v5/species.js` (14 species, per-mode setups).
- Browser buoy access: SECOORA ERDDAP CDIP mirror (CORS OK) — `buoyUrls()` in spots.js.
- Routing policy: `AGENTS.md` (CLAUDE.md imports it). Codex CLI 0.160.0 → gpt-6.1-sol available.

## DECISIONS
Path `/v5/`; region St. Aug→Flagler; modes surf+pier+inshore; GO/MAYBE/SKIP + species suitability % (never "chance") + separate historical rate; Supabase = migrations in repo only; vanilla ES modules, no build; style = root app shell + v1/v3 hero.

## NEXT TASK
1. Sonnet 5.5 High: product-spec pass on `docs/v5-spec.md` (product/UI sections).
2. Luna High (parallel): MRIP data QA (group catches, denominators, sample sizes).
3. Sol 6.1 High: technical architecture pass (contracts, engine, scoring, confidence, schema).
4. Opus 5.5 High: independent architecture red team.
Then Luna High implementation (phase A engine/API/tests/migration, phase B UI).

## DEFINITION OF DONE
See "Definition of done" in `docs/v5-spec.md`.

## BLOCKERS / OPEN QUESTIONS
- MRIP ocean-shore intercepts are mostly piers (812/931); beach/bank n=91.
- Beverly/Flagler ocean tides use Sunglow Pier (24–26 mi south).
