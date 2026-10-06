# Prototype deterministic audit — 2026-10-06

Run against `http://127.0.0.1:8765/v5/proto/` (commit d8af3fa) with axe-core 4.10.2, the browser console and DOM measurements.

## Errors
- **Console:** `RangeError: Invalid time value` at `proto.js:74` (`dayKey`) via `relDay` → `windowLine` (`proto.js:280`) → `betRow` (`proto.js:293`) → `verdictCard` → `todayView`. Fires during render; a previous fix did not cover every path.

## Accessibility (axe-core)
| View | Dark (375 px) | Light (1024 px) |
|---|---|---|
| Today, GO | color-contrast ×2, region ×1 | color-contrast ×6 (`.mchip`, `summary[data-fk=conf]`, backup `.mchip`) |
| Today, SKIP | color-contrast ×4 | color-contrast ×10 (`.mchip`, `.why-q`, `.tag`) |
| Spots | — | color-contrast ×3 (`.nm`, tab label, `#review-btn`) |
| Species | — | **color-contrast ×31** (species grid names, tags, numbers) |
| Plan | — | color-contrast ×2 (`.btn`, `#review-btn`) |

Dark-mode failing pairs: `.tag` "Rare in surveys" #5b6773 on #161f29 = 2.87:1; `.hint` suitability note #5b6773 on #161f29 = 2.87:1; `.vchip` "Outside windows" #64748b on #121a22 = 3.68:1; `#review-btn` #73808d on #10181f = 4.43:1 (11 px). Target ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI glyphs.
- **Landmarks:** `#ctl` (Today/Tomorrow control) sits outside any landmark.

## Touch targets (< 44 × 44 px)
`a.skip` 104×22 (visible only on focus — acceptable), `button.mark` 38×38, Today/Tomorrow buttons 100×40, `#review-btn` 94×30 (review-only tool).

## Typography
Twelve distinct rendered font sizes on Today: 11, 11.5, 12, 12.5, 13, 14, 14.5, 15, 18, 20, 21, 22, 30 px. There is no consistent type scale; 11–12 px text is also where most contrast failures are.

## Layout
- No horizontal scroll at 375 px or 1024 px in any state or tab.
- Desktop at 1024 px renders a single 560 px column; no wider layout. Today page height at 375 px is ≈ 2340 px.
