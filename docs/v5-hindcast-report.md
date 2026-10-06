# V5 A5 365-date hindcast and GO-frequency gate

**Every result is a perfect-observation sensitivity hindcast, not a forecast-accuracy test.**

Window: 2025-10-01 through 2026-09-30 (local build dates). All scenarios use primary 06:00 builds only. 1095 real model builds were run. The primary independent daily statistic is the 06:00 today Best-anywhere recommendation (365 dates); tomorrow and 19:00 baseline outputs are separate diagnostics.

## Headline (proposal baseline: tide scale 0.50 ft/hr, GO threshold 70)

| Measure | Result | Gate |
|---|---:|---|
| 06:00 Best-anywhere verdict shares among source-complete, ungated days | GO 100.0% · MAYBE 0.0% · SKIP 0.0% (n=361, source-complete=361, safety-gated=0) | GO target 15–40% |
| Diagnostic verdict mix across all selected 06:00 Best-anywhere recommendations | GO 99.2% · MAYBE 0.8% · SKIP 0.0% (n=365; includes incomplete/gated days) | diagnostic only |
| Source-complete date coverage, weakest spot×mode×month | 87.1% (salt-run · inshore · 2026-03) | ≥80% every month |
| Highest monthly Best-anywhere GO share | 100.0% (2025-10) | ≤70% each month |
| Weakest active location×mode GO share | 47.4% (flagler-icw · inshore) | ≥3% each |

## Gate status at threshold 70

| Gate | Result | Details |
|---|---|---|
| Monthly source coverage | **PASS** | 0 spot×mode×month rows below 80% |
| Best-anywhere GO share | **FAIL** | 100.0% of source-complete ungated daily recommendations |
| No month over 70% GO | **FAIL** | 12 zero-denominator or >70% months |
| Every active spot×mode at least 3% GO | **PASS** | 0 zero-denominator or <3% spot×mode scopes |
| Full launch-frequency gate | **FAIL — owner review / exception required** | A5 does not accept any provisional parameter |

## Monthly source-complete denominators

A source-complete spot×mode×date is one where the real model emitted at least one candidate window whose every 30-minute slot had wind, gust, direction, rain proxy, observed thunder state, pressure trend, CO-OPS tide height/rate, and CDIP water temperature; ocean modes also require a CDIP wave observation/interpolation for every slot. This strict source-coverage measure is independent of safety gates; a complete-but-safety-gated date is reported separately. The fixed MRIP artifact and computed astro are not counted as live source channels.

All 12 months × active spot×mode denominators follow; FAIL rows are the coverage-gate exceptions (0 rows). Safety-gated counts are for each spot×mode's selected recommendation at threshold 70; source-complete safety gates are shown separately.

| Month | Spot | Mode | Candidate days | Source-complete / dates | Incomplete dates | Safety-gated selected recs | Source-complete safety-gated | Ungated complete recs | Coverage | Gate |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 2025-10 | vilano-beach | surf | 31 | 31/31 | 0 | 2 | 1 | 27 | 100.0% | PASS |
| 2025-10 | vilano-bridge | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2025-10 | bridge-of-lions | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2025-10 | salt-run | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2025-10 | staug-pier | pier | 31 | 31/31 | 0 | 2 | 1 | 27 | 100.0% | PASS |
| 2025-10 | staug-pier | surf | 31 | 31/31 | 0 | 2 | 1 | 27 | 100.0% | PASS |
| 2025-10 | matanzas-inlet | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2025-10 | matanzas-inlet | surf | 31 | 31/31 | 0 | 2 | 1 | 28 | 100.0% | PASS |
| 2025-10 | marineland | surf | 31 | 31/31 | 0 | 2 | 1 | 27 | 100.0% | PASS |
| 2025-10 | bings-landing | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2025-10 | beverly-beach | surf | 31 | 30/31 | 1 | 2 | 1 | 27 | 96.8% | PASS |
| 2025-10 | flagler-pier | pier | 31 | 30/31 | 1 | 2 | 1 | 27 | 96.8% | PASS |
| 2025-10 | flagler-pier | surf | 31 | 30/31 | 1 | 2 | 1 | 27 | 96.8% | PASS |
| 2025-10 | flagler-icw | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2025-11 | vilano-beach | surf | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | vilano-bridge | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | bridge-of-lions | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | salt-run | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | staug-pier | pier | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | staug-pier | surf | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | matanzas-inlet | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | matanzas-inlet | surf | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | marineland | surf | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | bings-landing | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | beverly-beach | surf | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | flagler-pier | pier | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | flagler-pier | surf | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-11 | flagler-icw | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2025-12 | vilano-beach | surf | 31 | 31/31 | 0 | 1 | 1 | 29 | 100.0% | PASS |
| 2025-12 | vilano-bridge | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2025-12 | bridge-of-lions | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2025-12 | salt-run | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2025-12 | staug-pier | pier | 31 | 31/31 | 0 | 1 | 1 | 27 | 100.0% | PASS |
| 2025-12 | staug-pier | surf | 31 | 31/31 | 0 | 1 | 1 | 27 | 100.0% | PASS |
| 2025-12 | matanzas-inlet | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2025-12 | matanzas-inlet | surf | 31 | 29/31 | 2 | 1 | 1 | 27 | 93.5% | PASS |
| 2025-12 | marineland | surf | 31 | 31/31 | 0 | 1 | 1 | 27 | 100.0% | PASS |
| 2025-12 | bings-landing | inshore | 31 | 30/31 | 1 | 0 | 0 | 30 | 96.8% | PASS |
| 2025-12 | beverly-beach | surf | 31 | 31/31 | 0 | 1 | 1 | 30 | 100.0% | PASS |
| 2025-12 | flagler-pier | pier | 31 | 31/31 | 0 | 1 | 1 | 30 | 100.0% | PASS |
| 2025-12 | flagler-pier | surf | 31 | 31/31 | 0 | 1 | 1 | 30 | 100.0% | PASS |
| 2025-12 | flagler-icw | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | vilano-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | vilano-bridge | inshore | 31 | 31/31 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-01 | bridge-of-lions | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | salt-run | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | staug-pier | pier | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | staug-pier | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | matanzas-inlet | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | matanzas-inlet | surf | 31 | 31/31 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-01 | marineland | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | bings-landing | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | beverly-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | flagler-pier | pier | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | flagler-pier | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-01 | flagler-icw | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-02 | vilano-beach | surf | 28 | 28/28 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-02 | vilano-bridge | inshore | 28 | 27/28 | 1 | 0 | 0 | 0 | 96.4% | PASS |
| 2026-02 | bridge-of-lions | inshore | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | salt-run | inshore | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | staug-pier | pier | 28 | 28/28 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-02 | staug-pier | surf | 28 | 28/28 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-02 | matanzas-inlet | inshore | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | matanzas-inlet | surf | 28 | 28/28 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-02 | marineland | surf | 28 | 28/28 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-02 | bings-landing | inshore | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | beverly-beach | surf | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | flagler-pier | pier | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | flagler-pier | surf | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-02 | flagler-icw | inshore | 28 | 28/28 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-03 | vilano-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-03 | vilano-bridge | inshore | 31 | 29/31 | 2 | 0 | 0 | 0 | 93.5% | PASS |
| 2026-03 | bridge-of-lions | inshore | 31 | 29/31 | 2 | 0 | 0 | 0 | 93.5% | PASS |
| 2026-03 | salt-run | inshore | 31 | 27/31 | 4 | 0 | 0 | 0 | 87.1% | PASS |
| 2026-03 | staug-pier | pier | 31 | 31/31 | 0 | 0 | 0 | 25 | 100.0% | PASS |
| 2026-03 | staug-pier | surf | 31 | 31/31 | 0 | 0 | 0 | 25 | 100.0% | PASS |
| 2026-03 | matanzas-inlet | inshore | 31 | 28/31 | 3 | 0 | 0 | 27 | 90.3% | PASS |
| 2026-03 | matanzas-inlet | surf | 31 | 29/31 | 2 | 1 | 1 | 25 | 93.5% | PASS |
| 2026-03 | marineland | surf | 31 | 31/31 | 0 | 0 | 0 | 25 | 100.0% | PASS |
| 2026-03 | bings-landing | inshore | 31 | 30/31 | 1 | 0 | 0 | 0 | 96.8% | PASS |
| 2026-03 | beverly-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-03 | flagler-pier | pier | 31 | 31/31 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-03 | flagler-pier | surf | 31 | 31/31 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-03 | flagler-icw | inshore | 31 | 31/31 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-04 | vilano-beach | surf | 30 | 30/30 | 0 | 3 | 3 | 26 | 100.0% | PASS |
| 2026-04 | vilano-bridge | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-04 | bridge-of-lions | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-04 | salt-run | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-04 | staug-pier | pier | 30 | 30/30 | 0 | 3 | 3 | 24 | 100.0% | PASS |
| 2026-04 | staug-pier | surf | 30 | 30/30 | 0 | 3 | 3 | 24 | 100.0% | PASS |
| 2026-04 | matanzas-inlet | inshore | 30 | 29/30 | 1 | 0 | 0 | 25 | 96.7% | PASS |
| 2026-04 | matanzas-inlet | surf | 30 | 30/30 | 0 | 3 | 3 | 26 | 100.0% | PASS |
| 2026-04 | marineland | surf | 30 | 30/30 | 0 | 3 | 3 | 24 | 100.0% | PASS |
| 2026-04 | bings-landing | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-04 | beverly-beach | surf | 30 | 30/30 | 0 | 3 | 3 | 26 | 100.0% | PASS |
| 2026-04 | flagler-pier | pier | 30 | 30/30 | 0 | 3 | 3 | 26 | 100.0% | PASS |
| 2026-04 | flagler-pier | surf | 30 | 30/30 | 0 | 3 | 3 | 26 | 100.0% | PASS |
| 2026-04 | flagler-icw | inshore | 30 | 30/30 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-05 | vilano-beach | surf | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | vilano-bridge | inshore | 31 | 30/31 | 1 | 0 | 0 | 27 | 96.8% | PASS |
| 2026-05 | bridge-of-lions | inshore | 31 | 30/31 | 1 | 0 | 0 | 0 | 96.8% | PASS |
| 2026-05 | salt-run | inshore | 31 | 29/31 | 2 | 0 | 0 | 26 | 93.5% | PASS |
| 2026-05 | staug-pier | pier | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | staug-pier | surf | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | matanzas-inlet | inshore | 31 | 30/31 | 1 | 0 | 0 | 26 | 96.8% | PASS |
| 2026-05 | matanzas-inlet | surf | 31 | 29/31 | 2 | 0 | 0 | 25 | 93.5% | PASS |
| 2026-05 | marineland | surf | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | bings-landing | inshore | 31 | 29/31 | 2 | 0 | 0 | 28 | 93.5% | PASS |
| 2026-05 | beverly-beach | surf | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | flagler-pier | pier | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | flagler-pier | surf | 31 | 29/31 | 2 | 0 | 0 | 29 | 93.5% | PASS |
| 2026-05 | flagler-icw | inshore | 31 | 30/31 | 1 | 0 | 0 | 30 | 96.8% | PASS |
| 2026-06 | vilano-beach | surf | 30 | 29/30 | 1 | 0 | 0 | 27 | 96.7% | PASS |
| 2026-06 | vilano-bridge | inshore | 30 | 29/30 | 1 | 0 | 0 | 29 | 96.7% | PASS |
| 2026-06 | bridge-of-lions | inshore | 30 | 29/30 | 1 | 0 | 0 | 29 | 96.7% | PASS |
| 2026-06 | salt-run | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-06 | staug-pier | pier | 30 | 29/30 | 1 | 0 | 0 | 27 | 96.7% | PASS |
| 2026-06 | staug-pier | surf | 30 | 29/30 | 1 | 0 | 0 | 27 | 96.7% | PASS |
| 2026-06 | matanzas-inlet | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-06 | matanzas-inlet | surf | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-06 | marineland | surf | 30 | 29/30 | 1 | 0 | 0 | 27 | 96.7% | PASS |
| 2026-06 | bings-landing | inshore | 30 | 29/30 | 1 | 0 | 0 | 0 | 96.7% | PASS |
| 2026-06 | beverly-beach | surf | 30 | 30/30 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-06 | flagler-pier | pier | 30 | 30/30 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-06 | flagler-pier | surf | 30 | 30/30 | 0 | 0 | 0 | 28 | 100.0% | PASS |
| 2026-06 | flagler-icw | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-07 | vilano-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-07 | vilano-bridge | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-07 | bridge-of-lions | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-07 | salt-run | inshore | 31 | 31/31 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-07 | staug-pier | pier | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-07 | staug-pier | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-07 | matanzas-inlet | inshore | 31 | 30/31 | 1 | 0 | 0 | 0 | 96.8% | PASS |
| 2026-07 | matanzas-inlet | surf | 31 | 31/31 | 0 | 0 | 0 | 24 | 100.0% | PASS |
| 2026-07 | marineland | surf | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-07 | bings-landing | inshore | 31 | 31/31 | 0 | 0 | 0 | 0 | 100.0% | PASS |
| 2026-07 | beverly-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-07 | flagler-pier | pier | 31 | 31/31 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-07 | flagler-pier | surf | 31 | 31/31 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-07 | flagler-icw | inshore | 31 | 31/31 | 0 | 0 | 0 | 31 | 100.0% | PASS |
| 2026-08 | vilano-beach | surf | 31 | 31/31 | 0 | 0 | 0 | 27 | 100.0% | PASS |
| 2026-08 | vilano-bridge | inshore | 31 | 31/31 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-08 | bridge-of-lions | inshore | 31 | 31/31 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-08 | salt-run | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2026-08 | staug-pier | pier | 31 | 30/31 | 1 | 0 | 0 | 27 | 96.8% | PASS |
| 2026-08 | staug-pier | surf | 31 | 30/31 | 1 | 0 | 0 | 27 | 96.8% | PASS |
| 2026-08 | matanzas-inlet | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2026-08 | matanzas-inlet | surf | 31 | 30/31 | 1 | 0 | 0 | 0 | 96.8% | PASS |
| 2026-08 | marineland | surf | 31 | 30/31 | 1 | 0 | 0 | 27 | 96.8% | PASS |
| 2026-08 | bings-landing | inshore | 31 | 30/31 | 1 | 0 | 0 | 29 | 96.8% | PASS |
| 2026-08 | beverly-beach | surf | 31 | 30/31 | 1 | 0 | 0 | 27 | 96.8% | PASS |
| 2026-08 | flagler-pier | pier | 31 | 30/31 | 1 | 0 | 0 | 26 | 96.8% | PASS |
| 2026-08 | flagler-pier | surf | 31 | 30/31 | 1 | 0 | 0 | 26 | 96.8% | PASS |
| 2026-08 | flagler-icw | inshore | 31 | 31/31 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-09 | vilano-beach | surf | 30 | 29/30 | 1 | 1 | 1 | 28 | 96.7% | PASS |
| 2026-09 | vilano-bridge | inshore | 30 | 29/30 | 1 | 0 | 0 | 28 | 96.7% | PASS |
| 2026-09 | bridge-of-lions | inshore | 30 | 29/30 | 1 | 0 | 0 | 27 | 96.7% | PASS |
| 2026-09 | salt-run | inshore | 30 | 29/30 | 1 | 0 | 0 | 27 | 96.7% | PASS |
| 2026-09 | staug-pier | pier | 30 | 29/30 | 1 | 1 | 1 | 28 | 96.7% | PASS |
| 2026-09 | staug-pier | surf | 30 | 29/30 | 1 | 1 | 1 | 28 | 96.7% | PASS |
| 2026-09 | matanzas-inlet | inshore | 30 | 28/30 | 2 | 0 | 0 | 27 | 93.3% | PASS |
| 2026-09 | matanzas-inlet | surf | 30 | 29/30 | 1 | 1 | 1 | 27 | 96.7% | PASS |
| 2026-09 | marineland | surf | 30 | 29/30 | 1 | 1 | 1 | 28 | 96.7% | PASS |
| 2026-09 | bings-landing | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |
| 2026-09 | beverly-beach | surf | 30 | 30/30 | 0 | 1 | 1 | 28 | 100.0% | PASS |
| 2026-09 | flagler-pier | pier | 30 | 30/30 | 0 | 1 | 1 | 28 | 100.0% | PASS |
| 2026-09 | flagler-pier | surf | 30 | 30/30 | 0 | 1 | 1 | 28 | 100.0% | PASS |
| 2026-09 | flagler-icw | inshore | 30 | 30/30 | 0 | 0 | 0 | 30 | 100.0% | PASS |

## GO threshold sweep at tide scale 0.50 ft/hr

Threshold values are review candidates only. Best-anywhere shares use source-complete, ungated 06:00 today recommendations; each spot×mode row uses its own selected daily recommendation on source-complete, ungated dates.

| goSuitabilityMin candidate | Best GO share | Best denominator | Gate result | Surf GO share | Pier GO share | Inshore GO share |
|---:|---:|---:|---|---:|---:|---:|
| 55 | 100.0% | 363/363 | FAIL | 100.0% | — | 100.0% |
| 60 | 100.0% | 363/363 | FAIL | 100.0% | — | 100.0% |
| 65 | 100.0% | 363/363 | FAIL | 100.0% | — | 100.0% |
| 70 | 100.0% | 361/361 | FAIL | 100.0% | — | 100.0% |
| 75 | 96.1% | 345/359 | FAIL | 95.1% | — | 100.0% |
| 80 | 91.0% | 322/354 | FAIL | 88.5% | — | 97.9% |
| 85 | 64.8% | 223/344 | FAIL | 62.8% | — | 70.2% |

### Per spot×mode GO share by threshold

Each cell is GO / source-complete ungated days. An em dash means no valid denominator; zero denominators fail the gate.

| Spot | Mode | 55 | 60 | 65 | 70 | 75 | 80 | 85 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vilano-beach | surf | 330/339 (97.3%) | 330/339 (97.3%) | 330/339 (97.3%) | 329/339 (97.1%) | 300/338 (88.8%) | 249/334 (74.6%) | 168/331 (50.8%) |
| vilano-bridge | inshore | 235/235 (100.0%) | 235/235 (100.0%) | 235/235 (100.0%) | 235/235 (100.0%) | 235/235 (100.0%) | 214/233 (91.8%) | 86/233 (36.9%) |
| bridge-of-lions | inshore | 266/266 (100.0%) | 266/266 (100.0%) | 266/266 (100.0%) | 254/266 (95.5%) | 244/266 (91.7%) | 228/265 (86.0%) | 135/265 (50.9%) |
| salt-run | inshore | 231/231 (100.0%) | 231/231 (100.0%) | 229/231 (99.1%) | 211/231 (91.3%) | 179/231 (77.5%) | 123/231 (53.2%) | 55/231 (23.8%) |
| staug-pier | pier | 324/333 (97.3%) | 324/333 (97.3%) | 324/333 (97.3%) | 323/333 (97.0%) | 294/332 (88.6%) | 245/331 (74.0%) | 164/330 (49.7%) |
| staug-pier | surf | 324/333 (97.3%) | 324/333 (97.3%) | 324/333 (97.3%) | 323/333 (97.0%) | 294/332 (88.6%) | 245/331 (74.0%) | 164/330 (49.7%) |
| matanzas-inlet | inshore | 283/283 (100.0%) | 283/283 (100.0%) | 283/283 (100.0%) | 268/283 (94.7%) | 246/283 (86.9%) | 183/283 (64.7%) | 102/283 (36.0%) |
| matanzas-inlet | surf | 158/212 (74.5%) | 158/212 (74.5%) | 153/212 (72.2%) | 138/212 (65.1%) | 122/212 (57.5%) | 85/212 (40.1%) | 36/212 (17.0%) |
| marineland | surf | 324/333 (97.3%) | 324/333 (97.3%) | 324/333 (97.3%) | 323/333 (97.0%) | 294/332 (88.6%) | 245/331 (74.0%) | 165/330 (50.0%) |
| bings-landing | inshore | 237/237 (100.0%) | 229/237 (96.6%) | 213/237 (89.9%) | 169/237 (71.3%) | 101/237 (42.6%) | 40/237 (16.9%) | 4/237 (1.7%) |
| beverly-beach | surf | 332/341 (97.4%) | 332/341 (97.4%) | 332/341 (97.4%) | 330/341 (96.8%) | 301/340 (88.5%) | 244/336 (72.6%) | 163/332 (49.1%) |
| flagler-pier | pier | 331/340 (97.4%) | 331/340 (97.4%) | 331/340 (97.4%) | 329/340 (96.8%) | 300/339 (88.5%) | 244/335 (72.8%) | 163/331 (49.2%) |
| flagler-pier | surf | 331/340 (97.4%) | 331/340 (97.4%) | 331/340 (97.4%) | 329/340 (96.8%) | 300/339 (88.5%) | 244/335 (72.8%) | 163/331 (49.2%) |
| flagler-icw | inshore | 292/303 (96.4%) | 280/303 (92.4%) | 256/303 (84.5%) | 143/302 (47.4%) | 51/302 (16.9%) | 24/302 (7.9%) | 3/302 (1.0%) |

## Mode recommendation verdict mix at threshold 70

Mode rows include dates where Best-anywhere selected that mode; all-run mix includes incomplete or safety-gated recommendations. The source-complete, ungated gate mix remains in the threshold table.

| Selected mode | GO / n | GO share | MAYBE share | SKIP share | Complete ungated GO / n |
|---|---:|---:|---:|---:|---:|
| surf | 285/288 | 99.0% | 1.0% | 0.0% | 284/284 |
| pier | 0/0 | — | — | — | 0/0 |
| inshore | 77/77 | 100.0% | 0.0% | 0.0% | 77/77 |

### Inshore gate detail

Across selected inshore daily recommendations: GO 77/77 (100.0%), MAYBE 0, SKIP 0; source-complete ungated GO 77/77 (100.0%). Each active inshore spot is listed in the location×mode sweep; monthly inshore denominators appear in the source table above.


## Month-by-month Best-anywhere frequency at threshold 70

| Month | GO / denominator | GO share | MAYBE share | SKIP share | Safety-gated selected recs |
|---|---:|---:|---:|---:|---:|
| 2025-10 | 31/31 | 100.0% | 0.0% | 0.0% | 0 |
| 2025-11 | 30/30 | 100.0% | 0.0% | 0.0% | 0 |
| 2025-12 | 31/31 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-01 | 31/31 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-02 | 28/28 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-03 | 31/31 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-04 | 29/29 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-05 | 29/29 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-06 | 30/30 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-07 | 31/31 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-08 | 30/30 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-09 | 30/30 | 100.0% | 0.0% | 0.0% | 0 |

## Best-anywhere leads

06:00 today selected driver species across all dates (including incomplete/gated days):

| Species | Leads / 365 | Share |
|---|---:|---:|
| whiting | 253/365 | 69.3% |
| mangrove | 64/365 | 17.5% |
| bluefish | 36/365 | 9.9% |
| pompano | 6/365 | 1.6% |
| trout | 3/365 | 0.8% |
| flounder | 2/365 | 0.5% |
| blackdrum | 1/365 | 0.3% |

## Tide-scale sensitivity

The code kept `params.js` unchanged and ran full engine builds with copied parameter objects at the documented 0.50 ft/hr proposal and ±25% (0.375, 0.625). Each scale is crossed with every threshold candidate.

| Tide scale ft/hr | GO threshold | Best GO share | Denominator | Inshore GO share | Inshore denominator | Mean Best suitability | Gate result |
|---:|---:|---:|---:|---:|---:|---:|---|
| 0.375 | 55 | 100.0% | 362/362 | 100.0% | 77/77 | 86.0 | FAIL |
| 0.375 | 60 | 100.0% | 362/362 | 100.0% | 77/77 | 86.0 | FAIL |
| 0.375 | 65 | 100.0% | 362/362 | 100.0% | 77/77 | 86.0 | FAIL |
| 0.375 | 70 | 100.0% | 362/362 | 100.0% | 77/77 | 86.0 | FAIL |
| 0.375 | 75 | 95.8% | 345/360 | 100.0% | 76/76 | 86.0 | FAIL |
| 0.375 | 80 | 90.8% | 325/358 | 98.9% | 91/92 | 86.0 | FAIL |
| 0.375 | 85 | 67.0% | 235/351 | 75.3% | 73/97 | 86.0 | FAIL |
| 0.500 | 55 | 100.0% | 363/363 | 100.0% | 79/79 | 85.7 | FAIL |
| 0.500 | 60 | 100.0% | 363/363 | 100.0% | 79/79 | 85.7 | FAIL |
| 0.500 | 65 | 100.0% | 363/363 | 100.0% | 79/79 | 85.7 | FAIL |
| 0.500 | 70 | 100.0% | 361/361 | 100.0% | 77/77 | 85.7 | FAIL |
| 0.500 | 75 | 96.1% | 345/359 | 100.0% | 75/75 | 85.7 | FAIL |
| 0.500 | 80 | 91.0% | 322/354 | 97.9% | 92/94 | 85.7 | FAIL |
| 0.500 | 85 | 64.8% | 223/344 | 70.2% | 66/94 | 85.7 | FAIL |
| 0.625 | 55 | 100.0% | 363/363 | 100.0% | 79/79 | 85.5 | FAIL |
| 0.625 | 60 | 100.0% | 363/363 | 100.0% | 79/79 | 85.5 | FAIL |
| 0.625 | 65 | 100.0% | 362/362 | 100.0% | 78/78 | 85.5 | FAIL |
| 0.625 | 70 | 100.0% | 362/362 | 100.0% | 78/78 | 85.5 | FAIL |
| 0.625 | 75 | 96.4% | 348/361 | 100.0% | 77/77 | 85.5 | FAIL |
| 0.625 | 80 | 89.0% | 317/356 | 92.7% | 89/96 | 85.5 | FAIL |
| 0.625 | 85 | 62.5% | 217/347 | 67.7% | 63/93 | 85.5 | FAIL |

## Morning, evening, and tomorrow

| Output | GO / MAYBE / SKIP shares on source-complete ungated recommendations (threshold 70, tide 0.50) |
|---|---|
| 06:00 tomorrow | GO 100.0% · MAYBE 0.0% · SKIP 0.0% (n=363, source-complete=363, safety-gated=0) |
| 19:00 today/evening | GO — · MAYBE — · SKIP — (n=0, source-complete=0, safety-gated=0) |
| 19:00 tomorrow | GO — · MAYBE — · SKIP — (n=0, source-complete=0, safety-gated=0) |

## Alerts and confidence

Historical NWS alerts were unavailable. Every run used the ADR scenario assumption `unverified/checked-none`, with an empty alert list and `alertsChecked=true`. This avoids the engine's unchecked-alert confidence penalty (20 points) and removes historical warning safety gates; it can therefore increase GO eligibility and confidence relative to unknown real alert history. Those alerts are not recovered facts. No counterfactual alert history is inferred.

## Fixed parameter iteration record

| Iteration | Input | Measured use | Outcome / decision status |
|---|---|---|---|
| 0 | Committed `MODEL_PARAMS`: GO threshold null, realistic floor 0.05 marked provisional, tide normalization null with proposal 0.50 | Read only; no baseline GO threshold or tide factor is active in the committed parameters | Kept untouched; not accepted by A5 |
| 1 | Tide scale 0.500 ft/hr; GO threshold candidates 55, 60, 65, 70, 75, 80, 85 | Full-year daily recommendation sweep | See threshold table; candidate status only |
| 2 | Tide scales 0.375 and 0.625 ft/hr; same seven thresholds | Full-year sensitivity to −25% / +25% around 0.500 | See tide table; candidate status only |
| 3 | Source completeness required as defined above; alerts fixed to unverified/checked-none | All 12 months × active spot×mode scopes evaluated | No score/floor/tide edits were made to force a pass |
| 4 | METAR absent-gust / absent-weather semantics fix: gust null + wind present → gust 0 mph; weather-codes null + observation present → "" (observed-none) | Data semantics correctness fix applied to all runs | Improves source-complete slot coverage; GO threshold and tide scale unchanged |

## Proposals and unresolved gate

No tested threshold/tide-scale pair passes every source-coverage and GO-frequency gate. No `goSuitabilityMin` proposal can be recommended from this archive alone. Keep the GO threshold pending; keep the 0.05 realistic floor provisional and keep tide normalization at null in `params.js`. The source-coverage shortfall needs an owner decision on a documented data source/coverage exception or additional archived measurements before frequency acceptance.

## Method and caveats

- perfect-observation sensitivity hindcast, not a forecast-accuracy test; observed target-slot data are a perfect-information stand-in and not a forecast-accuracy test.
- Runs use real `buildPredictionRun` and the current V5 model for every active spot×mode, with deterministic local 06:00 and 19:00 build instants. No random components or network fetches are used.
- The engine receives 10 species targetable at at least one active spot×mode; catalog species outside every active target list are off-list everywhere and cannot win a recommendation.
- KFIN ASOS uses actual `reportTime` for interpolation and point availability. Wind and pressure are converted from knots/inHg; rain occurrence is mapped to a labelled 0/100 proxy. Gust absent with wind present is interpreted as no gust reported (0 mph); weather-codes absent with observation present is interpreted as no significant weather (""). Interpolation requires bracketing valid values no more than three hours apart; weather code/rain use the nearest report only within 90 minutes.
- CDIP 194 is a single offshore station, used at all spot coordinates without spatial correction. Wave values use bracketing observations within three hours as perfect target-slot stand-ins. Water temperature uses the latest CDIP observation at or before build time, never a later temperature.
- CO-OPS rows are date-calculated harmonic high/low predictions in GMT/MLLW, not measurements or archived prediction issuance. Tide scale is tested only as a proposed model parameter.
- Model GO requires gust and a boolean thunder observation in every slot. ASOS gust field coverage is sparse, but METAR semantics (null gust = 0 mph when wind is present, null weather-codes = no significant weather) ensure source-complete windows when an observation exists.
- MRIP inputs are the frozen regional survey artifact. Suitability is not probability or catch accuracy. This hindcast does not establish station-level representativeness, real forecast skill, operational safety, or recovered historical alerts.
- Source/cache hashes, build count, and exact summaries are in the gitignored .cache/hindcast-out/hindcast-results.json. Source manifest SHA-256: 6b5190b24a397ae6cb20fc880f777b554dc69f9fd593ca95f896e13891cf5490.

