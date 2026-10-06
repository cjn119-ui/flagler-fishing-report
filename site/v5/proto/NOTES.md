# V5 app prototype — notes

Static, non-production, interactive prototype of the V5 app (phase B groundwork). Serve `site/` and open `/v5/proto/`. Vanilla ES modules, no build.
Look and feel follows the live main report (`site/style.css` tokens, card, score ring, stat tiles, chips, week bars, header bar with brand mark and refresh). No sunset hero.

## Share / review hash
`#tab=today|spots|species|plan`, `spot=<id>`, `mode=surf|pier|inshore`, `species=<id>`, `h=today|tomorrow`, `t=<ISO slot>`, `day=0..6`, `state=go|maybe|skip|stale|offline|partial`, `theme=light|dark`. "Review states" (bottom right) is review-only.

## Data
- `sample-rich.json` / `sample-rich-tomorrow.json` are contract-shaped runs with all locations, `scopeViews` (byLocation, bySpecies focused), `candidates`, `slots` and `days`. `sample-today|go|skip|stale|partial.json` drive the review states. Every number, spot, species and time is illustrative.
- Proto-only extras (not yet engine outputs): `_proto.factors`, `_proto.light` (sunrise/sunset), `slots[].tideEvents`, `why[].effect`, `backup.reason`, `days[].windows`, `nextOption`. These are the fields the real builder must emit.
- UI renders only from JSON and `engine/copy.js`; species/spot names and setup text come from `../species.js` and `../spots.js`. No scoring in the UI. Clock is fixed per state (`nowOffsetMin` / `nowIso` in `proto.js`).

## Implemented
Header (brand mark = Today, spot pill, updated chip, refresh), Today/Tomorrow toggle, mode chips, bottom tabs (Today, Spots, Species, Plan), spot-picker sheet from the pill, Spots ranked list (verdict chips, mode filter, Near me, tap to select and return to Today), Species grid plus detail sheet (12-month `seasonCurve` bars, local history, setup, "Target this"), species focus re-ranks Today with a removable "Targeting" chip, Plan 7-day strip (Promising/Mixed/Tough outlook labels, tap to expand a day), timeline scrubber (tap, drag, arrow keys) with a conditions readout and species ranking for that slot, expandable Why / all-factors table, Backup, Confidence reasons, Local history toggle, Data & sources, hash-based state, review-states panel. Sheets trap focus, close on Escape and return focus. Verdict is an `aria-live` region.

## Gaps
- Scrubber reads only the 30-minute `slots` in the JSON. If a slot has no `topSpecies`, the readout says so and keeps window targets; per-slot species ranking depends on the engine emitting that.
- Species focus uses `scopeViews.bySpecies[id].focused`; a species with no usable window shows a notice instead of a re-rank.
- Near me uses browser geolocation once per session, nothing stored. Favorites persist only in localStorage `v5proto.*`.
- Conditions tiles are only as plain-worded as the sample data; engine emits no tile labels yet.
- Imports `engine/copy.js` directly; if its exports change this prototype breaks.
- Tomorrow uses a separate sample file; the real app would read the same run's horizon.

## Taste questions, answered with the implemented choice
1. Hero: dropped the sunset gradient. A normal report card with the ring (word only) and a faint verdict-colour wash; Best bet sits inside it.
2. Ring: word only, in the report's ring style; the arc is decorative.
3. SKIP: Targets and Use stay, muted, with a "Muted: <reason>" line (safety SKIP shows the shield and reason first).
4. Verdict and Best bet merged into one card (about 70 px saved); Next best option replaces Best bet on SKIP.
5. Backup follows Confidence, before Why.
6. Provisional-GO sentence shortened to "Strong candidate; GO threshold still provisional." (engine/copy.js still owns the long form).

## Remaining questions for the owner
- Keep Targets above Use and Confidence, or move Confidence up beside the ring?
- Should the Today/Tomorrow toggle stay on Spots and Species, or only on Today?
- Plan outlook days: vertical labels in the bars (current) or a list of days?
- Remove "Review states" for any non-reviewer build? Draw tide as a line over the scrubber bars?
