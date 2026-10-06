# V5 Today prototype — notes

Static, non-production look-and-feel prototype of the Today screen (phase B groundwork). Serve `site/` and open `/v5/proto/`.
Deep links: `#state=go|maybe|skip|stale|offline|partial` and `&theme=light|dark`. "Review states" (bottom right) is review-only.

## Data
- `sample-today.json` is the real fixture MAYBE recommendation (`generate-v5.mjs --fixtures`, provisional-GO wording, tide missing) trimmed. `sample-go|skip|stale|partial.json` are hand-built. All five pass `validatePredictionRun`. Every number, spot, species and time is illustrative.
- Proto-only extras (not yet engine outputs): `_proto.factors` (L2/L3 factor rows from the details files, with plain-word text), `_proto.light` (sunrise/sunset), `slots[0].tideEvents`, `why[].effect`, `backup.reason` text, `days[].windows`, `nextOption` shape. These are the fields the real engine/builder will need to emit.
- The UI shows each state at a fixed clock (`nowOffsetMin` / `nowIso` in `proto.js`) so ages and "Fish now" are reproducible.

## From the spec
Above-the-fold order (header, verdict, Best bet, Targets, Use, Confidence), then Backup, Why, Best times, Today vs tomorrow, Data & sources. Ring shows the word only (arc is decorative), colour + icon + word, `aria-live="polite"` verdict with a spoken sentence, caption "Last known" when stale. GO/MAYBE/SKIP never recomputed. "Suitability" label plus the dismissible first-use line; "Local history" toggle (`aria-pressed`) reveals the "About N in 10 trips" or band line via `engine/copy.js`. "Rare in surveys" tag. Provisional-GO reason shown verbatim. Amber qualifier under the headline. Safety SKIP: reason first, shield icon, Next best option replaces Best bet, targets hidden. Freshness chip, stale/offline banners, partial chip, struck-through past window with the next one promoted. Light and dark, reduced motion, 44 px targets, no horizontal scroll (375 px verified, 560 px column on desktop).

## Not built
Scrubber, Conditions tiles (engine emits no plain-word tile labels yet), species focus UI (caption code exists), Tomorrow horizon, sheets, real tabs (stubs).

## Known gaps
- At 375x667 with the hint dismissed, Use fits above the tab bar but Confidence sits just below the fold (spec budget not fully met; the hero and verdict card were already tightened).
- Imports `engine/copy.js` directly; if that file's exports change this prototype breaks.

## Taste questions for the owner
1. Hero: full sunset gradient vs a quieter navy hero with only a sun glow? Verdict card overlaps the hero edge; keep?
2. Ring: word-only with a thin decorative arc, or a solid colour disc?
3. Safety SKIP hides Targets and Use. Right call, or show them muted?
4. Verdict card plus separate Best bet card, or merge into one block to save about 70 px?
5. Timeline: dashed tide line over suitability bars, or tide as an area under the bars?
6. Backup directly after Confidence, or after Why?
7. Provisional-GO sentence is long; shorten ("Strong candidate; GO threshold still provisional")?
