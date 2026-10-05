# Agent instructions — flagler-fishing-report

Applies to every agent working in this repo (Claude Code, Codex, OpenClaw). These project rules
override global model-routing defaults for this repo only; global safety, production, credential
and external-action rules still apply.

## Repo basics

- Static PWA on GitHub Pages; scheduled workflow `.github/workflows/pages.yml` regenerates `site/api/*.json` every 30 min. See `README.md`.
- Root `/`, `/v1/`–`/v3/` are live and must not change behaviour while V5 is built. V5 lives in `site/v5/`.
- No npm dependencies, no build step. Node 22 for scripts/tests; `scripts/build_first_coast_history.py` is the only Python (offline data build).
- Tests: `node scripts/test-logic.mjs`, `test-app.mjs`, `test-catch.mjs`, `test-calculations.mjs`, `test-validator.mjs` (CI-gated); V5 adds `scripts/test-v5.mjs`.
- V5 spec: `docs/v5-spec.md`. Product brief decisions there are owner-approved; change them only with Chris's approval.

## V5 model and effort routing (owner-set 2026-10-05)

Route by task type and consequence of failure — never give a task to the strongest model just because it is important.
Pool: **GPT-6 Luna**, **GPT-6.1 Sol** (Codex CLI ≥ 0.160 required; verified on 0.160.0), **Claude Sonnet 5.5**, **Claude Opus 5.5**.

> Luna builds. Sonnet shapes and polishes. Sol engineers and reasons through the hard technical parts. Opus challenges assumptions and handles the highest-judgment decisions.

| Role | Model / effort | Owns |
|---|---|---|
| CHIEF / orchestrator | GPT-6 Luna Medium (currently the Claude Code session, by owner choice) | Decomposition, delegation, milestones, acceptance gates, handoffs, scope control, escalation. Does not personally solve every hard problem. |
| Product spec / UX | Claude Sonnet 5.5 High | Canonical product spec, user journeys, mobile hierarchy, spot picker, species sheets, 7-day planner, GO/MAYBE/SKIP presentation, progressive disclosure, empty/error states, wording, visual coherence. |
| Hard product decisions | Claude Opus 5.5 High (selectively) | Ambiguous IA, simplicity vs transparency, recommendation semantics, cross-mode behaviour, expansion, app strategy, moat-affecting UX. Not routine component specs. |
| Core technical architecture | GPT-6.1 Sol High | Domain model, engine, observation contracts, provider abstraction, location/mode/species relations, scoring, confidence, ranking, shared morning/evening pipeline, persistence, versioned runs, SQL schema, app/API contracts, history integration, hard refactors. |
| Architecture red team | Claude Opus 5.5 High (review only) | Does the design serve the product; unnecessary abstraction; premature infra; hidden assumptions; explainability; native-app readiness; calibration support. |
| Main implementation | GPT-6 Luna High | Frontend, components, spot picker, species cards, mode selection, comparisons, tide timeline, planner, loading/freshness states, responsive, service worker, caching, provider adapters, parsing, tests, established-contract refactors. Implements the architecture; a bad contract goes back to Sol, never patched around. |
| Data / QA | GPT-6 Luna High | MRIP profiling, grain, missingness, duplicates, species normalization, geography, mode segmentation, temporal alignment, station mapping, sample sizes, denominators, fixtures, regression tests, model-version comparisons. Statistics/weighting/calibration/leakage/bias/uncertainty → Sol High; what evidence should *mean* to anglers → Opus High. |
| Fishing research | GPT-6 Luna Medium (High when sources conflict) | NOAA/SECOORA/NDBC/CDIP docs, tide stations, regulations, species behaviour, seasonality, local reports, competitors. Preserve provenance; no uncited rule, forum claim or anecdote becomes a scoring factor. |
| UX / design review | Sonnet 5.5 High; Opus 5.5 High for occasional full-product reviews | Hierarchy, mobile usability, polish, readability, density, accessibility, consistency. Opus gate question: *"Is this still a fishing decision product, or drifting back toward a weather dashboard?"* |
| Technical reviewer | GPT-6.1 Sol High | Architecture drift, duplicated prediction logic, provider leakage, hard-coded locations, frontend calculations that belong in the engine, morning/evening divergence, broken contracts, persistence coupling, missing-data failures, scoring bugs. |
| Product/architecture reviewer | Claude Opus 5.5 High | Product drift, misleading language, false precision, density, weak explanations or fallbacks, feature creep, needless complexity, whether the app answers the fishing decision. |

Reviews are independent: neither reviewer sees the other's conclusions first.
Consequential milestones get both: Sol High implementation review + Opus High product/architecture review.

**Escalation.** Sol High when several subsystems interact, agents disagree on implementation architecture, or a decision could force major rework. Opus High when the conflict is product/architecture judgment, requirements conflict, UX vs technical constraints, or correct behaviour is ambiguous.
**Sol XHigh** only for severe scoring inconsistencies, hard cross-module bugs, major schema redesign, unexplained model behaviour, failures surviving normal debugging, and the final technical release review.

**Fixer routing.** Luna High: adapters, parsing, normalization, service workers, caching, ordinary JS/Python bugs, tests, plumbing. Sonnet High: UI/interaction/CSS/layout/state/accessibility and localized fixes. Sol High: scoring, engine, contract and cross-module failures, fixes that break another subsystem. Opus High: when the "bug" shows intended behaviour is wrong or underspecified — resolve the behaviour, then hand the fix to the right implementer.

**Workflow.** 1 CHIEF (Luna Med) → 2 product spec (Sonnet High) → 3 hard product decisions (Opus High, only if needed) → 4 technical architecture (Sol High) → 5 architecture red team (Opus High) → 6 implementation (Luna High) → 7 data/prediction validation (Luna High) → 8 statistical/scoring escalation (Sol High) → 9 UX polish (Sonnet High) → 10 technical review (Sol High) → 11 product/architecture review (Opus High) → 12 targeted fixes (Luna/Sonnet/Sol by failure type) → 13 final RC review: Sol XHigh + Opus High, independent.

**Mechanics.** Codex runs: always set the working directory explicitly (`--cwd` / `-C /Users/christiannunez/flagler-fishing-report`) and pass model + effort explicitly (`gpt-6-luna` / `gpt-6.1-sol`, `low|medium|high|xhigh`). Claude roles run as Claude subagents with the named model. Never redispatch a running Codex job; check its status first.
