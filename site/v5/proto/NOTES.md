# V5 prototype — audit implementation, 2026-10-06

Static review prototype. Serve `site/`; open `/v5/proto/`. Vanilla ES modules, no dependencies or build. All scores, verdicts, windows, eligibility and recommendations still come from contract-shaped sample JSON. No engine changes or scoring added.

## Audit coverage

- P0-1–15 implemented: compact header and persistent hint dismissal; guarded dates and visible “Time unavailable” fallback; title-case verdict and short eyebrow; combined Targets/Use/Confidence card; fish-only Why; live-only qualifier; stale/offline semantics; full-opacity text; Plan rows and day sheets; copy cleanup; overlapping scrubber slots; dated backups; ended-window treatment; main landmark.
- P1-1–18 implemented: type/spacing tokens, grouped spot lists, bycatch disclosure, early species action and observer-driven sheet footer, tappable best place, Why now, unified history and FWC link, tide overlay and sparse axis, centered dialogs and hash-close, directions, pull-refresh gesture, actionable next option, neutral modes/favorites, joined comparison text, ordered condition tiles, dev-only review controls, sticky header, shaped skeleton and reduced-motion-aware transitions.
- Desktop/tablet: single DOM navigation moves into header at 900 px; Today has sticky answer/evidence columns; Spots has a selected-detail pane; Species opens a 400 px detail pane; Plan has rows/detail panes. Dialogs center from 768 px.
- P2-3,5,6 done: optional vibration helper, Plan scope caption, session disclosure memory.
- P2-1,2 deferred: manifest path is outside the authorized `proto/` boundary; install/splash assets belong with the real PWA shell, not this illustrative prototype.
- P2-4 superseded (2026-10-09, PR #21): the ring is replaced by a verdict seal with no suitability arc. Dropping the arc awaits owner approval (`.ai/PROJECT_STATE.md`, pending decision 6).

## Fold and implementation choices

At 375 × 667, with GO and the hint dismissed, the glance card ends at **600.72 px**, within the 602 px content fold. It is 252 px tall. Two primary targets are shown (“up to three”); all species remain available in Species. This reconciles the fold budget with 44 px target, history, Use and Why controls. First-use hint adds a compact two-line row. The hero is ≤230 px for the GO/MAYBE samples. The provisional-threshold explanation uses the approved short copy in expanded Confidence, preserving a concise hero without hiding the limitation. The light SKIP token is slightly darker than the proposed value (#B51F1F), and muted/GO tokens were strengthened so they also pass on tinted secondary surfaces.

## Deterministic verification

System Google Chrome headless via local DevTools protocol; scripts written in `/tmp`, no package download. Served `site/` with `python3 -m http.server 8766 --bind 127.0.0.1 --directory site`.

- 288 combinations: six review states × two horizons × four tabs × two themes × widths 375/768/1280. **0 console exceptions/errors, 0 horizontal overflow, 0 report-load failures.**
- Interaction checks at all three widths: Best bet, target species, picker, species detail, day detail and hash navigation. **0 errors/overflow; sheets close on hash changes.**
- Fetch-injected missing and invalid recommendation windows: **0 errors; both display “Time unavailable”.**
- `node --check site/v5/proto/proto.js` and `git diff --check` pass.
- Updated six GO screenshots in `shots/audit-{375,768,1280}-{light,dark}.png`.
- CSS token calculations below: all **46 text pairs ≥4.5:1**, including tinted secondary surfaces and buttons (minimum 4.72:1). These are deterministic token calculations, not a claim that axe-core was rerun.

## Text contrast pairs

- dark text/bg: 16.37:1
- dark text/surface: 15.14:1
- dark text/surface-2: 13.74:1
- dark muted/bg: 8.36:1
- dark muted/surface: 7.74:1
- dark muted/surface-2: 7.02:1
- dark accent-ink/bg: 9.83:1
- dark accent-ink/surface: 9.09:1
- dark accent-ink/surface-2: 8.25:1
- dark go/bg: 9.87:1
- dark go/surface: 9.13:1
- dark go/surface-2: 8.28:1
- dark mid-ink/bg: 11.37:1
- dark mid-ink/surface: 10.51:1
- dark mid-ink/surface-2: 9.54:1
- dark skip/bg: 6.86:1
- dark skip/surface: 6.34:1
- dark skip/surface-2: 5.76:1
- dark accent-ink/12% tint on surface-2: 6.44:1
- dark go/12% tint on surface-2: 6.51:1
- dark mid-ink/12% tint on surface-2: 7.39:1
- dark skip/12% tint on surface-2: 4.87:1
- dark btn-fg/btn-bg: 9.38:1
- light text/bg: 16.24:1
- light text/surface: 17.62:1
- light text/surface-2: 15.94:1
- light muted/bg: 6.15:1
- light muted/surface: 6.68:1
- light muted/surface-2: 6.04:1
- light accent-ink/bg: 5.56:1
- light accent-ink/surface: 6.03:1
- light accent-ink/surface-2: 5.45:1
- light go/bg: 6.73:1
- light go/surface: 7.30:1
- light go/surface-2: 6.61:1
- light mid-ink/bg: 6.38:1
- light mid-ink/surface: 6.92:1
- light mid-ink/surface-2: 6.26:1
- light skip/bg: 6.09:1
- light skip/surface: 6.60:1
- light skip/surface-2: 5.97:1
- light accent-ink/12% tint on surface-2: 4.72:1
- light go/12% tint on surface-2: 5.51:1
- light mid-ink/12% tint on surface-2: 5.36:1
- light skip/12% tint on surface-2: 4.90:1
- light btn-fg/btn-bg: 5.14:1

## Data limitations and handoff

Sample MAYBE Use is a “where” sentence; headlines do not always name a cause; some Plan windows omit spot names. These are upstream data items from the audit; UI does not invent replacements. Species Why now has a visible unavailable fallback when samples contain only data-quality reasons; fish-condition explanations require upstream contract data. No best-day tag is fabricated when JSON omits `bestDay`. Conditions render only available contract factors, at most six; pressure/season raw units are hidden in expanded factors. No real network refresh, offline cache, service worker, publishing or engine acceptance is claimed. Product acceptance remains with Chris.

Hash: `tab=today|spots|species|plan`, `spot`, `mode`, `species`, `h=today|tomorrow`, `t=<ISO>`, `day=0..6`, `state=go|maybe|skip|stale|offline|partial`, `theme=light|dark`. Review controls appear only on localhost/127.0.0.1 or explicit `review=1`.
