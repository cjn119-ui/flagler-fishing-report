# PROJECT
Flagler Fishing V5 — First Coast fishing-decision PWA (St. Augustine → Flagler; surf/pier/inshore). Foundation of a future app.

## OBJECTIVE
Answer in ~10 s: worth fishing? where? when? what to target? what to throw? GO/MAYBE/SKIP + species suitability (never "chance") + separate historical trip rate. Spec: `docs/v5-spec.md`; decisions: `docs/v5-product-decisions.md`, `docs/v5-architecture-decisions.md`, `docs/v5-inshore-go-decision.md`. Rules/routing: `AGENTS.md`.

## CURRENT PHASE
Engine A1–A4 done and review-fixed; inshore scoring fix in progress; hindcast data acquired; UI prototype being restyled. A5 (hindcast + GO threshold) and phase B (real UI) not started.

## CURRENT BRANCH / HEAD
`v5-catch-forecast`, local only (nothing pushed, no PR). Last commit c9513dc. Uncommitted work in progress: inshore fix (engine/tests/fixtures), prototype restyle (`site/v5/proto/`), untracked draft `supabase/` (unverified, never applied).

## COMPLETED
- Catalogs (11 active spots, 19 species); MRIP history with repaired catch definition (ocean .628 n=931, inland .442 n=1742); threshold sheet.
- Engine: contracts, params, copy, sources/adapters, history/astro/factors/model, run builder, generator (`scripts/generate-v5.mjs`), local archive scaffolding (upload refuses).
- Reviews: Opus red team, Luna XHigh A3 review, Sonnet adversarial review (F1–F18 fixed, 037e864), Opus inshore decision (8779c66).
- Hindcast data acquisition (`scripts/hindcast/`, data in ignored `.cache/hindcast`); Today-screen prototype v1.

## DECISIONS
Path `/v5/`; region St. Aug→Flagler; trips not anglers; bands Common≥.20/Occasional .05–.20/Rare<.05; floor .05 provisional; GO threshold and tide scale provisional; no county adjustment; GO target 15–40% via full-year hindcast (perfect-observation proxy; past forecasts/alerts not recoverable); archive upload design approved but upload/push/PR/merge each need Chris's separate go-ahead; inshore: fix water-key bug + no-hit months score low + mode-relative season reference (Opus decision, owner-approved); keep Supabase out of the live path (static JSON on Pages).
Routing (Chris): no Sol; Luna Low/Med/High bounded; Luna XHigh only former-Sol roles or when Chris says; Sonnet/Opus Medium for taste/judgment; Sonnet for adversarial review; deterministic checks run by orchestrator; launch Codex directly via `codex-companion task --write --model … --effort … --cwd … --prompt-file …`; arm a watcher with strict status check; verify a cancel stopped the thread.

## TEST STATUS
Before the in-progress inshore job: all 10 suites passed (contracts 9, sources 13, integration, model 44, run 20, five legacy). Re-run after the inshore job finishes.

## CURRENT WORKER
Luna XHigh (inshore fix, task-muwdhh87-glu0e8); Sonnet Medium (prototype restyle to main-report theme).

## NEXT TASK
1. Verify + commit inshore fix (run all suites, coverage: expect inshore ≈8/72, surf ≈64/72, pier 24/24).
2. Review prototype restyle in browser; record owner taste answers.
3. A5 on Luna XHigh: hindcast harness over `.cache/hindcast`, per-mode/per-spot GO gates, set provisional thresholds; bring measured failures to Chris.
4. Sonnet adversarial re-check; then phase B (real UI).
5. Validate `supabase/` migration in a throwaway Postgres (needs install approval), then commit.

## BLOCKERS / OPEN QUESTIONS
Postgres not installed locally; Supabase project creation needs cost approval; inshore GO rarity (owner exception only if a spot fails ≥3% hindcast gate); prototype taste questions in `site/v5/proto/NOTES.md`.
