# V5 A5 365-date hindcast and GO-frequency gate

**Every result is a perfect-observation sensitivity hindcast, not a forecast-accuracy test.**

Window: 2025-10-01 through 2026-09-30 (local build dates). All scenarios use primary 06:00 builds only. 1095 real model builds were run. The primary independent daily statistic is the 06:00 today Best-anywhere recommendation (365 dates); tomorrow and 19:00 baseline outputs are separate diagnostics.

## Headline (proposal baseline: tide scale 0.50 ft/hr, GO threshold 70)

| Measure | Result | Gate |
|---|---:|---|
| 06:00 Best-anywhere verdict shares among source-complete, ungated days | GO 100.0% · MAYBE 0.0% · SKIP 0.0% (n=51, source-complete=51, safety-gated=0) | GO target 15–40% |
| Diagnostic verdict mix across all selected 06:00 Best-anywhere recommendations | GO 14.0% · MAYBE 86.0% · SKIP 0.0% (n=365; includes incomplete/gated days) | diagnostic only |
| Source-complete date coverage, weakest spot×mode×month | 0.0% (vilano-bridge · inshore · 2026-05) | ≥80% every month |
| Highest monthly Best-anywhere GO share | 100.0% (2025-10) | ≤70% each month |
| Weakest active location×mode GO share | 48.5% (flagler-icw · inshore) | ≥3% each |

## Gate status at threshold 70

| Gate | Result | Details |
|---|---|---|
| Monthly source coverage | **FAIL** | 168 spot×mode×month rows below 80% |
| Best-anywhere GO share | **FAIL** | 100.0% of source-complete ungated daily recommendations |
| No month over 70% GO | **FAIL** | 12 zero-denominator or >70% months |
| Every active spot×mode at least 3% GO | **PASS** | 0 zero-denominator or <3% spot×mode scopes |
| Full launch-frequency gate | **FAIL — owner review / exception required** | A5 does not accept any provisional parameter |

## Monthly source-complete denominators

A source-complete spot×mode×date is one where the real model emitted at least one candidate window whose every 30-minute slot had wind, gust, direction, rain proxy, observed thunder state, pressure trend, CO-OPS tide height/rate, and CDIP water temperature; ocean modes also require a CDIP wave observation/interpolation for every slot. This strict source-coverage measure is independent of safety gates; a complete-but-safety-gated date is reported separately. The fixed MRIP artifact and computed astro are not counted as live source channels.

All 12 months × active spot×mode denominators follow; FAIL rows are the coverage-gate exceptions (168 rows). Safety-gated counts are for each spot×mode's selected recommendation at threshold 70; source-complete safety gates are shown separately.

| Month | Spot | Mode | Candidate days | Source-complete / dates | Incomplete dates | Safety-gated selected recs | Source-complete safety-gated | Ungated complete recs | Coverage | Gate |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 2025-10 | vilano-beach | surf | 31 | 2/31 | 29 | 2 | 0 | 0 | 6.5% | FAIL |
| 2025-10 | vilano-bridge | inshore | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2025-10 | bridge-of-lions | inshore | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2025-10 | salt-run | inshore | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2025-10 | staug-pier | pier | 31 | 2/31 | 29 | 2 | 0 | 0 | 6.5% | FAIL |
| 2025-10 | staug-pier | surf | 31 | 2/31 | 29 | 2 | 0 | 0 | 6.5% | FAIL |
| 2025-10 | matanzas-inlet | inshore | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2025-10 | matanzas-inlet | surf | 31 | 2/31 | 29 | 2 | 0 | 0 | 6.5% | FAIL |
| 2025-10 | marineland | surf | 31 | 2/31 | 29 | 2 | 0 | 0 | 6.5% | FAIL |
| 2025-10 | bings-landing | inshore | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2025-10 | beverly-beach | surf | 31 | 1/31 | 30 | 2 | 0 | 0 | 3.2% | FAIL |
| 2025-10 | flagler-pier | pier | 31 | 1/31 | 30 | 2 | 0 | 0 | 3.2% | FAIL |
| 2025-10 | flagler-pier | surf | 31 | 1/31 | 30 | 2 | 0 | 0 | 3.2% | FAIL |
| 2025-10 | flagler-icw | inshore | 31 | 3/31 | 28 | 0 | 0 | 1 | 9.7% | FAIL |
| 2025-11 | vilano-beach | surf | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | vilano-bridge | inshore | 30 | 4/30 | 26 | 0 | 0 | 4 | 13.3% | FAIL |
| 2025-11 | bridge-of-lions | inshore | 30 | 4/30 | 26 | 0 | 0 | 4 | 13.3% | FAIL |
| 2025-11 | salt-run | inshore | 30 | 5/30 | 25 | 0 | 0 | 5 | 16.7% | FAIL |
| 2025-11 | staug-pier | pier | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | staug-pier | surf | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | matanzas-inlet | inshore | 30 | 4/30 | 26 | 0 | 0 | 4 | 13.3% | FAIL |
| 2025-11 | matanzas-inlet | surf | 30 | 4/30 | 26 | 0 | 0 | 1 | 13.3% | FAIL |
| 2025-11 | marineland | surf | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | bings-landing | inshore | 30 | 5/30 | 25 | 0 | 0 | 5 | 16.7% | FAIL |
| 2025-11 | beverly-beach | surf | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | flagler-pier | pier | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | flagler-pier | surf | 30 | 4/30 | 26 | 0 | 0 | 3 | 13.3% | FAIL |
| 2025-11 | flagler-icw | inshore | 30 | 5/30 | 25 | 0 | 0 | 4 | 16.7% | FAIL |
| 2025-12 | vilano-beach | surf | 31 | 9/31 | 22 | 1 | 0 | 9 | 29.0% | FAIL |
| 2025-12 | vilano-bridge | inshore | 31 | 9/31 | 22 | 0 | 0 | 6 | 29.0% | FAIL |
| 2025-12 | bridge-of-lions | inshore | 31 | 9/31 | 22 | 0 | 0 | 9 | 29.0% | FAIL |
| 2025-12 | salt-run | inshore | 31 | 9/31 | 22 | 0 | 0 | 9 | 29.0% | FAIL |
| 2025-12 | staug-pier | pier | 31 | 9/31 | 22 | 1 | 0 | 7 | 29.0% | FAIL |
| 2025-12 | staug-pier | surf | 31 | 9/31 | 22 | 1 | 0 | 7 | 29.0% | FAIL |
| 2025-12 | matanzas-inlet | inshore | 31 | 9/31 | 22 | 0 | 0 | 9 | 29.0% | FAIL |
| 2025-12 | matanzas-inlet | surf | 31 | 9/31 | 22 | 1 | 0 | 9 | 29.0% | FAIL |
| 2025-12 | marineland | surf | 31 | 9/31 | 22 | 1 | 0 | 7 | 29.0% | FAIL |
| 2025-12 | bings-landing | inshore | 31 | 8/31 | 23 | 0 | 0 | 7 | 25.8% | FAIL |
| 2025-12 | beverly-beach | surf | 31 | 7/31 | 24 | 1 | 0 | 7 | 22.6% | FAIL |
| 2025-12 | flagler-pier | pier | 31 | 7/31 | 24 | 1 | 0 | 7 | 22.6% | FAIL |
| 2025-12 | flagler-pier | surf | 31 | 7/31 | 24 | 1 | 0 | 7 | 22.6% | FAIL |
| 2025-12 | flagler-icw | inshore | 31 | 9/31 | 22 | 0 | 0 | 8 | 29.0% | FAIL |
| 2026-01 | vilano-beach | surf | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | vilano-bridge | inshore | 31 | 10/31 | 21 | 0 | 0 | 0 | 32.3% | FAIL |
| 2026-01 | bridge-of-lions | inshore | 31 | 11/31 | 20 | 0 | 0 | 11 | 35.5% | FAIL |
| 2026-01 | salt-run | inshore | 31 | 11/31 | 20 | 0 | 0 | 11 | 35.5% | FAIL |
| 2026-01 | staug-pier | pier | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | staug-pier | surf | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | matanzas-inlet | inshore | 31 | 11/31 | 20 | 0 | 0 | 11 | 35.5% | FAIL |
| 2026-01 | matanzas-inlet | surf | 31 | 11/31 | 20 | 0 | 0 | 0 | 35.5% | FAIL |
| 2026-01 | marineland | surf | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | bings-landing | inshore | 31 | 11/31 | 20 | 0 | 0 | 8 | 35.5% | FAIL |
| 2026-01 | beverly-beach | surf | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | flagler-pier | pier | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | flagler-pier | surf | 31 | 10/31 | 21 | 0 | 0 | 7 | 32.3% | FAIL |
| 2026-01 | flagler-icw | inshore | 31 | 11/31 | 20 | 0 | 0 | 11 | 35.5% | FAIL |
| 2026-02 | vilano-beach | surf | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | vilano-bridge | inshore | 28 | 2/28 | 26 | 0 | 0 | 0 | 7.1% | FAIL |
| 2026-02 | bridge-of-lions | inshore | 28 | 2/28 | 26 | 0 | 0 | 1 | 7.1% | FAIL |
| 2026-02 | salt-run | inshore | 28 | 2/28 | 26 | 0 | 0 | 1 | 7.1% | FAIL |
| 2026-02 | staug-pier | pier | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | staug-pier | surf | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | matanzas-inlet | inshore | 28 | 2/28 | 26 | 0 | 0 | 1 | 7.1% | FAIL |
| 2026-02 | matanzas-inlet | surf | 28 | 2/28 | 26 | 0 | 0 | 0 | 7.1% | FAIL |
| 2026-02 | marineland | surf | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | bings-landing | inshore | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | beverly-beach | surf | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | flagler-pier | pier | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | flagler-pier | surf | 28 | 2/28 | 26 | 0 | 0 | 2 | 7.1% | FAIL |
| 2026-02 | flagler-icw | inshore | 28 | 1/28 | 27 | 0 | 0 | 1 | 3.6% | FAIL |
| 2026-03 | vilano-beach | surf | 31 | 9/31 | 22 | 0 | 0 | 7 | 29.0% | FAIL |
| 2026-03 | vilano-bridge | inshore | 31 | 8/31 | 23 | 0 | 0 | 0 | 25.8% | FAIL |
| 2026-03 | bridge-of-lions | inshore | 31 | 8/31 | 23 | 0 | 0 | 0 | 25.8% | FAIL |
| 2026-03 | salt-run | inshore | 31 | 7/31 | 24 | 0 | 0 | 0 | 22.6% | FAIL |
| 2026-03 | staug-pier | pier | 31 | 9/31 | 22 | 0 | 0 | 4 | 29.0% | FAIL |
| 2026-03 | staug-pier | surf | 31 | 9/31 | 22 | 0 | 0 | 4 | 29.0% | FAIL |
| 2026-03 | matanzas-inlet | inshore | 31 | 8/31 | 23 | 0 | 0 | 7 | 25.8% | FAIL |
| 2026-03 | matanzas-inlet | surf | 31 | 8/31 | 23 | 1 | 0 | 7 | 25.8% | FAIL |
| 2026-03 | marineland | surf | 31 | 9/31 | 22 | 0 | 0 | 4 | 29.0% | FAIL |
| 2026-03 | bings-landing | inshore | 31 | 7/31 | 24 | 0 | 0 | 0 | 22.6% | FAIL |
| 2026-03 | beverly-beach | surf | 31 | 9/31 | 22 | 0 | 0 | 8 | 29.0% | FAIL |
| 2026-03 | flagler-pier | pier | 31 | 9/31 | 22 | 0 | 0 | 8 | 29.0% | FAIL |
| 2026-03 | flagler-pier | surf | 31 | 9/31 | 22 | 0 | 0 | 8 | 29.0% | FAIL |
| 2026-03 | flagler-icw | inshore | 31 | 9/31 | 22 | 0 | 0 | 0 | 29.0% | FAIL |
| 2026-04 | vilano-beach | surf | 30 | 4/30 | 26 | 3 | 0 | 3 | 13.3% | FAIL |
| 2026-04 | vilano-bridge | inshore | 30 | 3/30 | 27 | 0 | 0 | 0 | 10.0% | FAIL |
| 2026-04 | bridge-of-lions | inshore | 30 | 3/30 | 27 | 0 | 0 | 0 | 10.0% | FAIL |
| 2026-04 | salt-run | inshore | 30 | 3/30 | 27 | 0 | 0 | 0 | 10.0% | FAIL |
| 2026-04 | staug-pier | pier | 30 | 4/30 | 26 | 3 | 0 | 3 | 13.3% | FAIL |
| 2026-04 | staug-pier | surf | 30 | 4/30 | 26 | 3 | 0 | 3 | 13.3% | FAIL |
| 2026-04 | matanzas-inlet | inshore | 30 | 3/30 | 27 | 0 | 0 | 3 | 10.0% | FAIL |
| 2026-04 | matanzas-inlet | surf | 30 | 4/30 | 26 | 3 | 0 | 3 | 13.3% | FAIL |
| 2026-04 | marineland | surf | 30 | 4/30 | 26 | 3 | 0 | 3 | 13.3% | FAIL |
| 2026-04 | bings-landing | inshore | 30 | 3/30 | 27 | 0 | 0 | 0 | 10.0% | FAIL |
| 2026-04 | beverly-beach | surf | 30 | 3/30 | 27 | 3 | 0 | 3 | 10.0% | FAIL |
| 2026-04 | flagler-pier | pier | 30 | 3/30 | 27 | 3 | 0 | 3 | 10.0% | FAIL |
| 2026-04 | flagler-pier | surf | 30 | 3/30 | 27 | 3 | 0 | 3 | 10.0% | FAIL |
| 2026-04 | flagler-icw | inshore | 30 | 3/30 | 27 | 0 | 0 | 0 | 10.0% | FAIL |
| 2026-05 | vilano-beach | surf | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | vilano-bridge | inshore | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-05 | bridge-of-lions | inshore | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-05 | salt-run | inshore | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-05 | staug-pier | pier | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | staug-pier | surf | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | matanzas-inlet | inshore | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-05 | matanzas-inlet | surf | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-05 | marineland | surf | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | bings-landing | inshore | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-05 | beverly-beach | surf | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | flagler-pier | pier | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | flagler-pier | surf | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-05 | flagler-icw | inshore | 31 | 0/31 | 31 | 0 | 0 | 0 | 0.0% | FAIL |
| 2026-06 | vilano-beach | surf | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | vilano-bridge | inshore | 30 | 1/30 | 29 | 0 | 0 | 1 | 3.3% | FAIL |
| 2026-06 | bridge-of-lions | inshore | 30 | 1/30 | 29 | 0 | 0 | 1 | 3.3% | FAIL |
| 2026-06 | salt-run | inshore | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | staug-pier | pier | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | staug-pier | surf | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | matanzas-inlet | inshore | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | matanzas-inlet | surf | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | marineland | surf | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | bings-landing | inshore | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | beverly-beach | surf | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | flagler-pier | pier | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | flagler-pier | surf | 30 | 1/30 | 29 | 0 | 0 | 0 | 3.3% | FAIL |
| 2026-06 | flagler-icw | inshore | 30 | 1/30 | 29 | 0 | 0 | 1 | 3.3% | FAIL |
| 2026-07 | vilano-beach | surf | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-07 | vilano-bridge | inshore | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-07 | bridge-of-lions | inshore | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-07 | salt-run | inshore | 31 | 3/31 | 28 | 0 | 0 | 0 | 9.7% | FAIL |
| 2026-07 | staug-pier | pier | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-07 | staug-pier | surf | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-07 | matanzas-inlet | inshore | 31 | 3/31 | 28 | 0 | 0 | 0 | 9.7% | FAIL |
| 2026-07 | matanzas-inlet | surf | 31 | 3/31 | 28 | 0 | 0 | 0 | 9.7% | FAIL |
| 2026-07 | marineland | surf | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-07 | bings-landing | inshore | 31 | 2/31 | 29 | 0 | 0 | 0 | 6.5% | FAIL |
| 2026-07 | beverly-beach | surf | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2026-07 | flagler-pier | pier | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2026-07 | flagler-pier | surf | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2026-07 | flagler-icw | inshore | 31 | 3/31 | 28 | 0 | 0 | 3 | 9.7% | FAIL |
| 2026-08 | vilano-beach | surf | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | vilano-bridge | inshore | 31 | 1/31 | 30 | 0 | 0 | 1 | 3.2% | FAIL |
| 2026-08 | bridge-of-lions | inshore | 31 | 1/31 | 30 | 0 | 0 | 1 | 3.2% | FAIL |
| 2026-08 | salt-run | inshore | 31 | 1/31 | 30 | 0 | 0 | 1 | 3.2% | FAIL |
| 2026-08 | staug-pier | pier | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | staug-pier | surf | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | matanzas-inlet | inshore | 31 | 1/31 | 30 | 0 | 0 | 1 | 3.2% | FAIL |
| 2026-08 | matanzas-inlet | surf | 31 | 1/31 | 30 | 0 | 0 | 0 | 3.2% | FAIL |
| 2026-08 | marineland | surf | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | bings-landing | inshore | 31 | 3/31 | 28 | 0 | 0 | 2 | 9.7% | FAIL |
| 2026-08 | beverly-beach | surf | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | flagler-pier | pier | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | flagler-pier | surf | 31 | 2/31 | 29 | 0 | 0 | 2 | 6.5% | FAIL |
| 2026-08 | flagler-icw | inshore | 31 | 4/31 | 27 | 0 | 0 | 3 | 12.9% | FAIL |
| 2026-09 | vilano-beach | surf | 30 | 2/30 | 28 | 1 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | vilano-bridge | inshore | 30 | 2/30 | 28 | 0 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | bridge-of-lions | inshore | 30 | 2/30 | 28 | 0 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | salt-run | inshore | 30 | 1/30 | 29 | 0 | 0 | 1 | 3.3% | FAIL |
| 2026-09 | staug-pier | pier | 30 | 2/30 | 28 | 1 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | staug-pier | surf | 30 | 2/30 | 28 | 1 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | matanzas-inlet | inshore | 30 | 2/30 | 28 | 0 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | matanzas-inlet | surf | 30 | 1/30 | 29 | 1 | 0 | 0 | 3.3% | FAIL |
| 2026-09 | marineland | surf | 30 | 2/30 | 28 | 1 | 0 | 1 | 6.7% | FAIL |
| 2026-09 | bings-landing | inshore | 30 | 1/30 | 29 | 0 | 0 | 1 | 3.3% | FAIL |
| 2026-09 | beverly-beach | surf | 30 | 3/30 | 27 | 1 | 0 | 1 | 10.0% | FAIL |
| 2026-09 | flagler-pier | pier | 30 | 3/30 | 27 | 1 | 0 | 1 | 10.0% | FAIL |
| 2026-09 | flagler-pier | surf | 30 | 3/30 | 27 | 1 | 0 | 1 | 10.0% | FAIL |
| 2026-09 | flagler-icw | inshore | 30 | 3/30 | 27 | 0 | 0 | 1 | 10.0% | FAIL |

## GO threshold sweep at tide scale 0.50 ft/hr

Threshold values are review candidates only. Best-anywhere shares use source-complete, ungated 06:00 today recommendations; each spot×mode row uses its own selected daily recommendation on source-complete, ungated dates.

| goSuitabilityMin candidate | Best GO share | Best denominator | Gate result | Surf GO share | Pier GO share | Inshore GO share |
|---:|---:|---:|---|---:|---:|---:|
| 55 | 100.0% | 54/54 | FAIL | 100.0% | — | 100.0% |
| 60 | 100.0% | 53/53 | FAIL | 100.0% | — | 100.0% |
| 65 | 100.0% | 53/53 | FAIL | 100.0% | — | 100.0% |
| 70 | 100.0% | 51/51 | FAIL | 100.0% | — | 100.0% |
| 75 | 100.0% | 50/50 | FAIL | 100.0% | — | 100.0% |
| 80 | 98.0% | 48/49 | FAIL | 96.8% | — | 100.0% |
| 85 | 83.7% | 36/43 | FAIL | 79.3% | — | 92.9% |

### Per spot×mode GO share by threshold

Each cell is GO / source-complete ungated days. An em dash means no valid denominator; zero denominators fail the gate.

| Spot | Mode | 55 | 60 | 65 | 70 | 75 | 80 | 85 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| vilano-beach | surf | 37/37 (100.0%) | 37/37 (100.0%) | 37/37 (100.0%) | 37/37 (100.0%) | 37/37 (100.0%) | 29/32 (90.6%) | 22/31 (71.0%) |
| vilano-bridge | inshore | 18/18 (100.0%) | 18/18 (100.0%) | 18/18 (100.0%) | 18/18 (100.0%) | 18/18 (100.0%) | 18/18 (100.0%) | 6/18 (33.3%) |
| bridge-of-lions | inshore | 33/33 (100.0%) | 33/33 (100.0%) | 33/33 (100.0%) | 33/33 (100.0%) | 33/33 (100.0%) | 30/33 (90.9%) | 20/33 (60.6%) |
| salt-run | inshore | 30/30 (100.0%) | 30/30 (100.0%) | 30/30 (100.0%) | 30/30 (100.0%) | 28/30 (93.3%) | 24/30 (80.0%) | 14/29 (48.3%) |
| staug-pier | pier | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 31/31 (100.0%) | 28/31 (90.3%) | 22/31 (71.0%) |
| staug-pier | surf | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 31/31 (100.0%) | 28/31 (90.3%) | 22/31 (71.0%) |
| matanzas-inlet | inshore | 39/39 (100.0%) | 39/39 (100.0%) | 39/39 (100.0%) | 39/39 (100.0%) | 39/39 (100.0%) | 33/39 (84.6%) | 21/39 (53.8%) |
| matanzas-inlet | surf | 20/20 (100.0%) | 20/20 (100.0%) | 20/20 (100.0%) | 20/20 (100.0%) | 20/20 (100.0%) | 14/20 (70.0%) | 3/20 (15.0%) |
| marineland | surf | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 32/32 (100.0%) | 31/31 (100.0%) | 28/31 (90.3%) | 22/31 (71.0%) |
| bings-landing | inshore | 27/27 (100.0%) | 26/27 (96.3%) | 26/27 (96.3%) | 22/27 (81.5%) | 17/25 (68.0%) | 8/25 (32.0%) | 1/25 (4.0%) |
| beverly-beach | surf | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 28/31 (90.3%) | 21/29 (72.4%) |
| flagler-pier | pier | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 28/31 (90.3%) | 21/29 (72.4%) |
| flagler-pier | surf | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 35/35 (100.0%) | 28/31 (90.3%) | 21/29 (72.4%) |
| flagler-icw | inshore | 36/36 (100.0%) | 36/36 (100.0%) | 34/35 (97.1%) | 16/33 (48.5%) | 6/33 (18.2%) | 1/33 (3.0%) | 0/33 (0.0%) |

## Mode recommendation verdict mix at threshold 70

Mode rows include dates where Best-anywhere selected that mode; all-run mix includes incomplete or safety-gated recommendations. The source-complete, ungated gate mix remains in the threshold table.

| Selected mode | GO / n | GO share | MAYBE share | SKIP share | Complete ungated GO / n |
|---|---:|---:|---:|---:|---:|
| surf | 32/285 | 11.2% | 88.8% | 0.0% | 32/32 |
| pier | 0/0 | — | — | — | 0/0 |
| inshore | 19/80 | 23.8% | 76.3% | 0.0% | 19/19 |

### Inshore gate detail

Across selected inshore daily recommendations: GO 19/80 (23.8%), MAYBE 61, SKIP 0; source-complete ungated GO 19/19 (100.0%). Each active inshore spot is listed in the location×mode sweep; monthly inshore denominators appear in the source table above.


## Month-by-month Best-anywhere frequency at threshold 70

| Month | GO / denominator | GO share | MAYBE share | SKIP share | Safety-gated selected recs |
|---|---:|---:|---:|---:|---:|
| 2025-10 | 2/2 | 100.0% | 0.0% | 0.0% | 0 |
| 2025-11 | 5/5 | 100.0% | 0.0% | 0.0% | 0 |
| 2025-12 | 9/9 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-01 | 12/12 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-02 | 2/2 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-03 | 9/9 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-04 | 3/3 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-05 | 0/0 | — | — | — | 0 |
| 2026-06 | 1/1 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-07 | 3/3 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-08 | 3/3 | 100.0% | 0.0% | 0.0% | 0 |
| 2026-09 | 2/2 | 100.0% | 0.0% | 0.0% | 0 |

## Best-anywhere leads

06:00 today selected driver species across all dates (including incomplete/gated days):

| Species | Leads / 365 | Share |
|---|---:|---:|
| whiting | 256/365 | 70.1% |
| mangrove | 61/365 | 16.7% |
| bluefish | 30/365 | 8.2% |
| trout | 9/365 | 2.5% |
| pompano | 6/365 | 1.6% |
| redfish | 2/365 | 0.5% |
| blackdrum | 1/365 | 0.3% |

## Tide-scale sensitivity

The code kept `params.js` unchanged and ran full engine builds with copied parameter objects at the documented 0.50 ft/hr proposal and ±25% (0.375, 0.625). Each scale is crossed with every threshold candidate.

| Tide scale ft/hr | GO threshold | Best GO share | Denominator | Inshore GO share | Inshore denominator | Mean Best suitability | Gate result |
|---:|---:|---:|---:|---:|---:|---:|---|
| 0.375 | 55 | 100.0% | 55/55 | 100.0% | 21/21 | 85.9 | FAIL |
| 0.375 | 60 | 100.0% | 55/55 | 100.0% | 21/21 | 85.9 | FAIL |
| 0.375 | 65 | 100.0% | 54/54 | 100.0% | 20/20 | 85.9 | FAIL |
| 0.375 | 70 | 100.0% | 53/53 | 100.0% | 19/19 | 85.9 | FAIL |
| 0.375 | 75 | 100.0% | 51/51 | 100.0% | 17/17 | 85.9 | FAIL |
| 0.375 | 80 | 98.0% | 49/50 | 100.0% | 17/17 | 85.9 | FAIL |
| 0.375 | 85 | 86.0% | 37/43 | 100.0% | 11/11 | 85.9 | FAIL |
| 0.500 | 55 | 100.0% | 54/54 | 100.0% | 22/22 | 85.7 | FAIL |
| 0.500 | 60 | 100.0% | 53/53 | 100.0% | 21/21 | 85.7 | FAIL |
| 0.500 | 65 | 100.0% | 53/53 | 100.0% | 21/21 | 85.7 | FAIL |
| 0.500 | 70 | 100.0% | 51/51 | 100.0% | 19/19 | 85.7 | FAIL |
| 0.500 | 75 | 100.0% | 50/50 | 100.0% | 18/18 | 85.7 | FAIL |
| 0.500 | 80 | 98.0% | 48/49 | 100.0% | 18/18 | 85.7 | FAIL |
| 0.500 | 85 | 83.7% | 36/43 | 92.9% | 13/14 | 85.7 | FAIL |
| 0.625 | 55 | 100.0% | 58/58 | 100.0% | 22/22 | 85.5 | FAIL |
| 0.625 | 60 | 100.0% | 57/57 | 100.0% | 21/21 | 85.5 | FAIL |
| 0.625 | 65 | 100.0% | 57/57 | 100.0% | 21/21 | 85.5 | FAIL |
| 0.625 | 70 | 100.0% | 55/55 | 100.0% | 19/19 | 85.5 | FAIL |
| 0.625 | 75 | 100.0% | 53/53 | 100.0% | 17/17 | 85.5 | FAIL |
| 0.625 | 80 | 98.1% | 51/52 | 100.0% | 16/16 | 85.5 | FAIL |
| 0.625 | 85 | 82.6% | 38/46 | 91.7% | 11/12 | 85.5 | FAIL |

## Morning, evening, and tomorrow

| Output | GO / MAYBE / SKIP shares on source-complete ungated recommendations (threshold 70, tide 0.50) |
|---|---|
| 06:00 tomorrow | GO 100.0% · MAYBE 0.0% · SKIP 0.0% (n=60, source-complete=60, safety-gated=0) |
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

## Proposals and unresolved gate

No tested threshold/tide-scale pair passes every source-coverage and GO-frequency gate. No `goSuitabilityMin` proposal can be recommended from this archive alone. Keep the GO threshold pending; keep the 0.05 realistic floor provisional and keep tide normalization at null in `params.js`. The source-coverage shortfall needs an owner decision on a documented data source/coverage exception or additional archived measurements before frequency acceptance.

## Method and caveats

- perfect-observation sensitivity hindcast, not a forecast-accuracy test; observed target-slot data are a perfect-information stand-in and not a forecast-accuracy test.
- Runs use real `buildPredictionRun` and the current V5 model for every active spot×mode, with deterministic local 06:00 and 19:00 build instants. No random components or network fetches are used.
- The engine receives 10 species targetable at at least one active spot×mode; catalog species outside every active target list are off-list everywhere and cannot win a recommendation.
- KFIN ASOS uses actual `reportTime` for interpolation and point availability. Wind and pressure are converted from knots/inHg; rain occurrence is mapped to a labelled 0/100 proxy. Gust and weather-code gaps remain missing; the harness does not infer gusts or thunder from absent fields. Interpolation requires bracketing valid values no more than three hours apart; weather code/rain use the nearest report only within 90 minutes.
- CDIP 194 is a single offshore station, used at all spot coordinates without spatial correction. Wave values use bracketing observations within three hours as perfect target-slot stand-ins. Water temperature uses the latest CDIP observation at or before build time, never a later temperature.
- CO-OPS rows are date-calculated harmonic high/low predictions in GMT/MLLW, not measurements or archived prediction issuance. Tide scale is tested only as a proposed model parameter.
- ASOS gust field coverage is sparse; because model GO requires gust and a boolean thunder observation in every slot, missingness can prevent source-complete windows and GO regardless of the score threshold. Weather-code nulls remain unknown.
- MRIP inputs are the frozen regional survey artifact. Suitability is not probability or catch accuracy. This hindcast does not establish station-level representativeness, real forecast skill, operational safety, or recovered historical alerts.
- Source/cache hashes, build count, and exact summaries are in the gitignored .cache/hindcast-out/hindcast-results.json. Source manifest SHA-256: 6b5190b24a397ae6cb20fc880f777b554dc69f9fd593ca95f896e13891cf5490.

