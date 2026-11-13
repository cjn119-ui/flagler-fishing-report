# Historical catch likelihood model — phase A

Dataset: 2673 non-proxy MRIP shore interviews, 2015–2025. One row is one unique `(YEAR, WAVE, ID_CODE)` interview; 2,703 interviews before proxy exclusion is the source QA reference. Outcomes use the QA-approved personal Type A / B1 / B2 rule, excluding bait/unknown species for `any_fish`. Features are measured at interview time (local `TIME`; noon when missing).

Unweighted cross-validation is primary. WP_INT-weighted results are a sensitivity analysis. Evaluation is nested leave-one-year-out: each outer test year is excluded from model fitting, standardization, imputation and month/constant baselines; L2 lambda is selected in inner leave-one-year-out folds. The reported month baseline uses training-only month rates. `Brier skill = 1 - model Brier / month-climatology Brier`; positive means improvement.

## Dataset missingness

| Feature | Missing | Missing % |
|---|---:|---:|
| `doy_sin` | 0 | 0.0% |
| `doy_cos` | 0 | 0.0% |
| `month` | 0 | 0.0% |
| `hrsf` | 0 | 0.0% |
| `area_is_ocean` | 0 | 0.0% |
| `county_duval` | 0 | 0.0% |
| `county_flagler` | 0 | 0.0% |
| `county_nassau` | 0 | 0.0% |
| `county_st_johns` | 0 | 0.0% |
| `mode_f_1` | 0 | 0.0% |
| `mode_f_2` | 0 | 0.0% |
| `mode_f_3` | 0 | 0.0% |
| `mode_f_4` | 0 | 0.0% |
| `mode_f_5` | 0 | 0.0% |
| `water_temp_c` | 99 | 3.7% |
| `water_temp_anomaly_c` | 99 | 3.7% |
| `wind_speed_ms` | 92 | 3.4% |
| `wind_onshore_ms` | 346 | 12.9% |
| `wind_gust_ms` | 92 | 3.4% |
| `pressure_hpa` | 146 | 5.5% |
| `pressure_delta_3h_hpa` | 165 | 6.2% |
| `pressure_delta_24h_hpa` | 183 | 6.8% |
| `air_temp_c` | 217 | 8.1% |
| `rain_24h_mm` | 99 | 3.7% |
| `wave_height_m` | 2292 | 85.7% |
| `wave_period_s` | 2292 | 85.7% |
| `tide_rising` | 0 | 0.0% |
| `hours_to_next_high` | 0 | 0.0% |
| `hours_to_next_low` | 0 | 0.0% |
| `tide_range_day_m` | 0 | 0.0% |
| `hours_from_sunrise` | 0 | 0.0% |
| `hours_to_sunset` | 0 | 0.0% |
| `is_daylight` | 0 | 0.0% |
| `moon_illumination` | 0 | 0.0% |
| `moon_phase_sin` | 0 | 0.0% |
| `moon_phase_cos` | 0 | 0.0% |
| `solunar_major` | 0 | 0.0% |
| `solunar_minor` | 0 | 0.0% |
| `hours_since_cold_front` | 2673 | 100.0% |
| `sst_sat_c` | 2279 | 85.3% |
| `chlor_a_mgm3` | 2580 | 96.5% |

Wave features are deliberately null for inland trips. Their 85.7% overall missing rate corresponds to 59.1% missing among ocean trips. Satellite SST and chlorophyll have sparse coverage (85.3% and 96.5% missing overall); the cold-front feature is fully missing because the stored historical events were detected after the interview years.

## Out-of-sample results

| Target | n | positives | lambda range | Brier | Brier skill vs month | Log loss | AUC | Weighted Brier | Weighted skill | Weighted log loss | Weighted AUC | Month Brier | Constant Brier | WP_INT month Brier | WP_INT constant Brier |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| any_fish | 2673 | 1355 | 0.0100–0.1000 | 0.2252 | 0.0861 | 0.6410 | 0.6815 | 0.2294 | 0.0970 | 0.6498 | 0.6573 | 0.2464 | 0.2512 | 0.2541 | 0.2505 |
| catfish | 2673 | 292 | 1.0000–1.0000 | 0.0962 | -0.0072 | 0.3385 | 0.6361 | 0.1013 | -0.0198 | 0.3555 | 0.5672 | 0.0955 | 0.0976 | 0.0993 | 0.1008 |
| croaker | 2673 | 150 | 0.1000–1.0000 | 0.0531 | -0.0106 | 0.2175 | 0.4924 | 0.0564 | 0.0103 | 0.2309 | 0.5183 | 0.0525 | 0.0532 | 0.0570 | 0.0560 |
| panfish-misc | 2673 | 222 | 0.1000–10.0000 | 0.0764 | 0.0107 | 0.2878 | 0.4949 | 0.0675 | -0.0074 | 0.2627 | 0.5525 | 0.0772 | 0.0763 | 0.0670 | 0.0668 |
| sharks-rays | 2673 | 241 | 0.1000–1.0000 | 0.0814 | 0.0009 | 0.2965 | 0.6295 | 0.0805 | 0.0161 | 0.2969 | 0.5796 | 0.0815 | 0.0825 | 0.0818 | 0.0810 |
| whiting | 2673 | 425 | 0.0001–0.1000 | 0.1258 | 0.0562 | 0.4046 | 0.7175 | 0.1407 | 0.0749 | 0.4455 | 0.7124 | 0.1333 | 0.1349 | 0.1521 | 0.1513 |

## Reliability (unweighted outer-fold predictions)

### any_fish

| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |
|---|---:|---:|---:|---:|---:|
| 0.0-0.1 | 0 | — | — | — | — |
| 0.1-0.2 | 28 | 0.168 | 0.250 | 0.166 | 0.092 |
| 0.2-0.3 | 158 | 0.258 | 0.146 | 0.258 | 0.138 |
| 0.3-0.4 | 493 | 0.358 | 0.345 | 0.362 | 0.392 |
| 0.4-0.5 | 647 | 0.449 | 0.462 | 0.451 | 0.491 |
| 0.5-0.6 | 561 | 0.545 | 0.556 | 0.547 | 0.548 |
| 0.6-0.7 | 401 | 0.646 | 0.663 | 0.647 | 0.627 |
| 0.7-0.8 | 242 | 0.745 | 0.653 | 0.746 | 0.619 |
| 0.8-0.9 | 91 | 0.843 | 0.802 | 0.837 | 0.911 |
| 0.9-1.0 | 52 | 0.928 | 0.904 | 0.933 | 0.944 |

### catfish

| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |
|---|---:|---:|---:|---:|---:|
| 0.0-0.1 | 916 | 0.088 | 0.055 | 0.089 | 0.057 |
| 0.1-0.2 | 1741 | 0.122 | 0.139 | 0.123 | 0.137 |
| 0.2-0.3 | 16 | 0.210 | 0.000 | 0.210 | 0.000 |
| 0.3-0.4 | 0 | — | — | — | — |
| 0.4-0.5 | 0 | — | — | — | — |
| 0.5-0.6 | 0 | — | — | — | — |
| 0.6-0.7 | 0 | — | — | — | — |
| 0.7-0.8 | 0 | — | — | — | — |
| 0.8-0.9 | 0 | — | — | — | — |
| 0.9-1.0 | 0 | — | — | — | — |

### croaker

| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |
|---|---:|---:|---:|---:|---:|
| 0.0-0.1 | 2672 | 0.055 | 0.056 | 0.056 | 0.059 |
| 0.1-0.2 | 1 | 0.103 | 0.000 | 0.103 | 0.000 |
| 0.2-0.3 | 0 | — | — | — | — |
| 0.3-0.4 | 0 | — | — | — | — |
| 0.4-0.5 | 0 | — | — | — | — |
| 0.5-0.6 | 0 | — | — | — | — |
| 0.6-0.7 | 0 | — | — | — | — |
| 0.7-0.8 | 0 | — | — | — | — |
| 0.8-0.9 | 0 | — | — | — | — |
| 0.9-1.0 | 0 | — | — | — | — |

### panfish-misc

| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |
|---|---:|---:|---:|---:|---:|
| 0.0-0.1 | 2595 | 0.081 | 0.084 | 0.081 | 0.074 |
| 0.1-0.2 | 78 | 0.109 | 0.051 | 0.110 | 0.009 |
| 0.2-0.3 | 0 | — | — | — | — |
| 0.3-0.4 | 0 | — | — | — | — |
| 0.4-0.5 | 0 | — | — | — | — |
| 0.5-0.6 | 0 | — | — | — | — |
| 0.6-0.7 | 0 | — | — | — | — |
| 0.7-0.8 | 0 | — | — | — | — |
| 0.8-0.9 | 0 | — | — | — | — |
| 0.9-1.0 | 0 | — | — | — | — |

### sharks-rays

| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |
|---|---:|---:|---:|---:|---:|
| 0.0-0.1 | 2098 | 0.069 | 0.078 | 0.070 | 0.082 |
| 0.1-0.2 | 499 | 0.127 | 0.130 | 0.127 | 0.093 |
| 0.2-0.3 | 40 | 0.235 | 0.175 | 0.226 | 0.202 |
| 0.3-0.4 | 20 | 0.345 | 0.100 | 0.345 | 0.103 |
| 0.4-0.5 | 9 | 0.440 | 0.111 | 0.432 | 0.169 |
| 0.5-0.6 | 5 | 0.550 | 0.600 | 0.553 | 0.616 |
| 0.6-0.7 | 2 | 0.625 | 0.000 | 0.618 | 0.000 |
| 0.7-0.8 | 0 | — | — | — | — |
| 0.8-0.9 | 0 | — | — | — | — |
| 0.9-1.0 | 0 | — | — | — | — |

### whiting

| Probability bin | n | Mean predicted | Observed rate | WP_INT predicted | WP_INT observed |
|---|---:|---:|---:|---:|---:|
| 0.0-0.1 | 1255 | 0.049 | 0.065 | 0.049 | 0.062 |
| 0.1-0.2 | 717 | 0.144 | 0.174 | 0.147 | 0.176 |
| 0.2-0.3 | 337 | 0.240 | 0.318 | 0.240 | 0.369 |
| 0.3-0.4 | 195 | 0.347 | 0.262 | 0.346 | 0.299 |
| 0.4-0.5 | 100 | 0.450 | 0.290 | 0.454 | 0.274 |
| 0.5-0.6 | 36 | 0.546 | 0.500 | 0.544 | 0.298 |
| 0.6-0.7 | 25 | 0.632 | 0.400 | 0.628 | 0.437 |
| 0.7-0.8 | 4 | 0.738 | 0.500 | 0.748 | 0.543 |
| 0.8-0.9 | 4 | 0.825 | 0.500 | 0.827 | 0.794 |
| 0.9-1.0 | 0 | — | — | — | — |

## Largest standardized coefficients

Coefficients are the mean across outer folds, ordered by mean absolute magnitude. Positive values raise fitted log-odds; negative values lower them. Missing-value flags are explicitly named. These are associations, not causal effects.

### any_fish

| Feature | Mean coefficient | Mean absolute |
|---|---:|---:|
| `hrsf` | +0.4905 | 0.4905 |
| `area_is_ocean` | +0.1818 | 0.1818 |
| `mode_f_4` | -0.1383 | 0.1383 |
| `month` | +0.1008 | 0.1008 |
| `county_flagler` | +0.0779 | 0.0779 |
| `county_duval` | -0.0609 | 0.0609 |
| `rain_24h_mm` | +0.0592 | 0.0592 |
| `moon_phase_sin` | -0.0591 | 0.0591 |
| `air_temp_c__missing` | -0.0551 | 0.0581 |
| `doy_sin` | -0.0537 | 0.0537 |

### catfish

| Feature | Mean coefficient | Mean absolute |
|---|---:|---:|
| `hrsf` | +0.0412 | 0.0412 |
| `water_temp_c` | +0.0352 | 0.0352 |
| `doy_cos` | -0.0323 | 0.0323 |
| `rain_24h_mm` | +0.0310 | 0.0310 |
| `mode_f_1` | +0.0270 | 0.0270 |
| `area_is_ocean` | +0.0228 | 0.0228 |
| `air_temp_c` | +0.0226 | 0.0226 |
| `hours_to_sunset` | +0.0208 | 0.0208 |
| `sst_sat_c__missing` | -0.0203 | 0.0203 |
| `county_flagler` | +0.0202 | 0.0202 |

### croaker

| Feature | Mean coefficient | Mean absolute |
|---|---:|---:|
| `hrsf` | +0.0340 | 0.0340 |
| `mode_f_1` | +0.0336 | 0.0336 |
| `rain_24h_mm` | +0.0326 | 0.0335 |
| `mode_f_5` | -0.0291 | 0.0291 |
| `doy_cos` | -0.0274 | 0.0274 |
| `water_temp_c` | +0.0226 | 0.0226 |
| `air_temp_c` | +0.0219 | 0.0219 |
| `area_is_ocean` | +0.0203 | 0.0203 |
| `hours_to_sunset` | +0.0199 | 0.0199 |
| `pressure_delta_24h_hpa__missing` | +0.0197 | 0.0197 |

### panfish-misc

| Feature | Mean coefficient | Mean absolute |
|---|---:|---:|
| `hrsf` | +0.0380 | 0.0380 |
| `county_st_johns` | -0.0332 | 0.0332 |
| `sst_sat_c` | -0.0265 | 0.0265 |
| `county_duval` | +0.0264 | 0.0264 |
| `wave_period_s__missing` | +0.0207 | 0.0207 |
| `wave_height_m__missing` | +0.0207 | 0.0207 |
| `water_temp_anomaly_c` | +0.0187 | 0.0187 |
| `mode_f_4` | -0.0177 | 0.0177 |
| `moon_illumination` | +0.0148 | 0.0148 |
| `moon_phase_cos` | -0.0148 | 0.0148 |

### sharks-rays

| Feature | Mean coefficient | Mean absolute |
|---|---:|---:|
| `hrsf` | +0.2802 | 0.2802 |
| `area_is_ocean` | +0.1435 | 0.1435 |
| `rain_24h_mm` | +0.1332 | 0.1332 |
| `chlor_a_mgm3__missing` | -0.1034 | 0.1034 |
| `county_st_johns` | -0.0590 | 0.0590 |
| `moon_illumination` | -0.0550 | 0.0550 |
| `moon_phase_cos` | +0.0550 | 0.0550 |
| `county_duval` | +0.0468 | 0.0468 |
| `moon_phase_sin` | -0.0455 | 0.0455 |
| `mode_f_4` | -0.0449 | 0.0449 |

### whiting

| Feature | Mean coefficient | Mean absolute |
|---|---:|---:|
| `water_temp_c` | -0.8215 | 0.8215 |
| `area_is_ocean` | +0.6709 | 0.6709 |
| `hrsf` | +0.4610 | 0.4610 |
| `doy_cos` | -0.4161 | 0.4161 |
| `tide_range_day_m` | +0.3650 | 0.3650 |
| `doy_sin` | -0.2938 | 0.3031 |
| `county_nassau` | +0.2775 | 0.2775 |
| `mode_f_4` | -0.2231 | 0.2231 |
| `tide_rising` | +0.2117 | 0.2168 |
| `water_temp_anomaly_c` | +0.1946 | 0.2159 |

## Conclusion

Targets with positive out-of-sample Brier skill: any_fish, panfish-misc, sharks-rays, whiting. Improvements over the month climatology were any_fish: 0.0861 Brier skill (0.2252 vs 0.2464 Brier); panfish-misc: 0.0107 Brier skill (0.0764 vs 0.0772 Brier); sharks-rays: 0.0009 Brier skill (0.0814 vs 0.0815 Brier); whiting: 0.0562 Brier skill (0.1258 vs 0.1333 Brier). These are small-sample historical associations and need independent validation before use in the app.
The useful signal is strongest for any_fish and whiting. The largest terms are trip duration/access area for any_fish, and water temperature, area, season and tide for whiting. Panfish/misc and sharks/rays clear the Brier baseline by only about 0.0008 and 0.0001 points, respectively; their positive skills are too slight to treat as meaningful evidence yet.

## Limits and feature handling

- Intercepts are mostly at piers and other access points; interviewed anglers are a selected, non-random sample. Results do not estimate success for all anglers or specific spots.
- Interview time is the time of interview, usually near the end of a trip, rather than the timing of each catch. It is only a rough environmental match.
- Some species have limited positive samples; only species with at least 150 positive trips were evaluated. AUC may be unstable when a held-out year has few positives.
- Raw feature values remain null in the CSV. Model fitting explicitly fills missing values with each training fold's mean and adds a missingness indicator; no data-layer values are imputed. Full-fit JSON records means/scales.
- As-of gates require both `valid_at <= interview time` and `available_at <= interview time`. Look-backs: water/met/waves 3–6 h, satellite SST/chlorophyll 120 h, and rain accumulates eligible hourly values over 24 h. Tide predictions have no availability timestamp; they are treated as published deterministic predictions.
- Station mapping: NDBC 41117 for water temperature, wind, pressure, and ocean waves; SAUF1 fallback for water/wind/pressure. ASOS air temperature/rain: KSGJ for Duval, Nassau, St. Johns; KFIN for Flagler. CO-OPS tide: Duval 8720587, Nassau 8720587, St. Johns 8720587, Flagler 8720833 (nearest available coast stations in this database). Cold-front `location_id`: `st_augustine_beach` for Duval/Nassau/St. Johns; `flagler_beach` for Flagler.
- Cold-front events are used only when `detected_at <= interview time`; historical stored events were detected in 2026, so this feature is null for the 2015–2025 trips.
- Daylight/solunar calculations use the read-only engine `flagler.astro` helpers; satellite SST/chlorophyll use only observations whose `available_at` is no later than interview time.
- This is retrospective research, not a calibrated forecast. MRIP survey design/weights, nonrandom angler presence, and catch timing remain unmodeled.
