# V5 A5 365-date GO-definition hindcast

**perfect-observation sensitivity hindcast, not a forecast-accuracy test.** Window 2025-10-01 through 2026-09-30 local; 1095 builds. This report applies the fixed suitability floor 70 and seasonal margin +4; no GO parameter sweep was run.

## Primary result: 06:00 today, tide scale 0.50

| Measure | Result | Gate |
|---|---:|---|
| Best-anywhere GO share, source-complete ungated days | GO 30.5% (GO 111/364) | 15–40% |
| Absolute-only GO share (70 floor, no benchmark) | 30.5% (GO 111/364) | information only |
| Monthly Best-anywhere GO range | 13.3% (2026-04) to 60.0% (2025-11) | maximum ≤70%; 0% is reported |

## GO share by mode

Shares pool the eligible, source-complete ungated cell-days within each mode.

| Mode | GO / denominator | Share |
|---|---:|---:|
| surf | 227/2141 | 10.6% |
| pier | 76/715 | 10.6% |
| inshore | 108/2145 | 5.0% |

## GO share by location × mode

| Location | Mode | GO / denominator | Share |
|---|---|---:|---:|
| vilano-beach | surf | 40/358 | 11.2% |
| vilano-bridge | inshore | 3/357 | 0.8% |
| bridge-of-lions | inshore | 9/358 | 2.5% |
| salt-run | inshore | 17/354 | 4.8% |
| staug-pier | pier | 33/357 | 9.2% |
| staug-pier | surf | 33/357 | 9.2% |
| matanzas-inlet | inshore | 23/354 | 6.5% |
| matanzas-inlet | surf | 35/353 | 9.9% |
| marineland | surf | 33/357 | 9.2% |
| bings-landing | inshore | 29/358 | 8.1% |
| beverly-beach | surf | 43/358 | 12.0% |
| flagler-pier | pier | 43/358 | 12.0% |
| flagler-pier | surf | 43/358 | 12.0% |
| flagler-icw | inshore | 27/364 | 7.4% |

## Benchmark coverage

The seasonal baseline is the median own-cell daily-best suitability within ±15 calendar days. Safety-gated and non-source-complete rows are excluded. Fewer than 10 eligible rows yields a null benchmark, recorded as `no eligible candidates in this window`; null benchmarks cap verdicts at MAYBE with `benchmarkUnavailable`.

| Location | Mode | Finite benchmark range | Null benchmark windows |
|---|---|---:|---:|
| beverly-beach | surf | 73–94.5 | 0 |
| bings-landing | inshore | 63–81 | 104 |
| bridge-of-lions | inshore | 70–97 | 82 |
| flagler-icw | inshore | 55–82 | 51 |
| flagler-pier | pier | 73–94.5 | 0 |
| flagler-pier | surf | 73–94.5 | 0 |
| marineland | surf | 74–95 | 0 |
| matanzas-inlet | inshore | 70–88 | 52 |
| matanzas-inlet | surf | 20–92 | 99 |
| salt-run | inshore | 68–87 | 104 |
| staug-pier | pier | 74–95 | 0 |
| staug-pier | surf | 74–95 | 0 |
| vilano-beach | surf | 74–95 | 0 |
| vilano-bridge | inshore | 79.5–97 | 112 |

## Secondary horizons

| Build | GO share | Absolute-only GO share |
|---|---:|---:|
| 06:00 tomorrow | 31.6% | 31.6% |
| 19:00 today | — | — |
| 19:00 tomorrow | — | — |

## Gate status

Source coverage: PASS (0 month×cell rows below 80%). Headline frequency: PASS. Monthly maximum: PASS. Every cell at least 3%: FAIL. Zero denominators fail; all per-cell denominators are printed above.

## Caveats

- Benchmarks are in-sample on one year. This is a frequency sensitivity scenario, not accuracy evidence.
- Hindcast slots use perfect-observation inputs and historical alerts are assumed clear/unverified. This does not establish forecast skill, calibrated catch probability, or operational safety.
- Shared sources make spot×mode GO shares dependent. Suitability is a fit score, not a probability.
- Source manifest SHA-256: 6b5190b24a397ae6cb20fc880f777b554dc69f9fd593ca95f896e13891cf5490. Source/cache hashes are recorded in hindcast-results.json.

