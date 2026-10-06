# V5 A2 source evidence

Checked 2026-10-05. Live checks were read-only GETs with a descriptive NWS User-Agent. NWS requests included Origin: https://cjn119-ui.github.io; no credentials or writes were used. Small response excerpts retained under scripts/fixtures/v5/sources/.

## NWS waveHeight verification

**Verdict: available for tomorrow's full proposed ocean window; browser CORS is enabled.** The operational grid response contains properties.waveHeight, units wmoUnit:m, non-null intervals, and properties.updateTime. The nearshore point checks below returned HTTP 200 and Access-Control-Allow-Origin: * with the GitHub Pages Origin header. Fetch timestamp was about 2026-10-05 19:07 UTC; all listed nearshore grids reported updateTime=2026-10-05T18:21:08+00:00.

The verified target window was 2026-10-06 05:00–21:00 America/New_York (09:00 UTC October 6 through 01:00 UTC October 7). Interval-union coverage was continuous across that whole window for each row. Wave values were non-null in every returned interval. The grids' last valid periods ended October 11–12.

The fixed nearshore coordinate used for each active ocean location is the catalog latitude and longitude +0.05 degrees east (about 4.8 km offshore at this latitude). Each resolved to an NWS point with type=marine.

| Location | Nearshore coordinate | Grid / endpoint | Intervals | SHA-256 of {updateTime,waveHeight} |
|---|---:|---|---:|---|
| Vilano Beach | 29.9200, -81.2450 | JAX/83,48 — [grid](https://api.weather.gov/gridpoints/JAX/83,48) | 15/15 | 425580af6232c2b6e1d6ee8fc2f76869f7aa1cff06ce98e5f7081dbca2e1364e |
| St. Augustine Beach Pier | 29.8570, -81.2140 | JAX/85,45 — [grid](https://api.weather.gov/gridpoints/JAX/85,45) | 17/17 | b41359bd3a0dc1ff94afff70328661cc10b70f89522ad8f69ee0edee787d704e |
| Matanzas Inlet | 29.7070, -81.1790 | JAX/87,39 — [grid](https://api.weather.gov/gridpoints/JAX/87,39) | 17/17 | 9f1a47ed60e87f492cdbac0c5432a4a4357d636cada4db6c887949086bf90db8 |
| Marineland | 29.6300, -81.1550 | JAX/88,36 — [grid](https://api.weather.gov/gridpoints/JAX/88,36) | 17/17 | ebae1231d9ac0f827592412e5537ca30628d426df607950ab2ef2ec8dccaa335 |
| Beverly Beach | 29.5170, -81.0950 | JAX/91,31 — [grid](https://api.weather.gov/gridpoints/JAX/91,31) | 13/13 | 31899f2c497577272bbc9897fcd40cb690fb166111366be05313b7e460854f77 |
| Flagler Beach Pier | 29.4810, -81.0770 | JAX/91,30 — [grid](https://api.weather.gov/gridpoints/JAX/91,30) | 17/17 | 73a3d5390939670c560caa0b155f3a18cd41d6e8dc4070ccee29e5eb8b6c4ffa |

Hashes are SHA-256 over compact JSON.stringify({updateTime, waveHeight}) after parsing the response, not over raw HTTP bytes. They pin the returned field and issuance without retaining full grid responses.

The explicit catalog land point for Flagler Pier maps to JAX/89,29 (type=land). That grid also exposes one non-null interval, 2026-10-05T12:00Z/P6DT13H, value 0 m, but it is a coarse land-point result. It is not the chosen surf forecast. Its waveHeight field update time was 2026-10-05T16:31:48Z; compact field hash: f73666dc6cd24829222d07e0db680ed85e69e279a7a0feae241d02fe75aa5a6a.

The NWS point response for the offshore sample returned forecastGridData; its marine forecastHourly link is not relied on (the sample farther offshore JAX/100,30 returned 404 for that endpoint). Land points supply hourly forecasts and pressure stations; nearshore marine points supply the wave grid. This split follows the NWS documentation, which says coastal marine forecasts are available in forecastGridData.

Sources: [NWS API documentation](https://www.weather.gov/documentation/services-web-api), [NWS gridpoint field reference](https://weather-gov.github.io/api/gridpoints). The HTTP CORS check used the requested Origin header and read Access-Control-Allow-Origin: *; it was not a JavaScript fetch executed inside Chrome/Safari.

## CO-OPS station check

The Metadata API /stations/{id}/products.json returned HTTP 200 and listed **Tide Predictions** for every station in spots.js:

8720011, 8720194, 8720218, 8720291, 8720554, 8720576, 8720582, 8720587, 8720692, 8720757, 8720833, 8721120.

Only **8720218** also listed **Meteorological**. It is Mayport (Bar Pilots Dock), not an active V5 spot; it is the only waterTemp station configured in spots.js, and only on inactive rows. Direct water_temperature GETs for station 8720218 returned ten 6-minute readings for 2026-10-05 and readings for 2025-10-05. A direct predictions GET for 8721120 returned high/low rows for 2026-10-05/06 and seven rows for 2025-10-05/06. Prediction history is generated from station prediction constituents, not an archived forecast issuance.

Sources: [CO-OPS Metadata API](https://api.tidesandcurrents.noaa.gov/mdapi/prod/), [CO-OPS Data API](https://api.tidesandcurrents.noaa.gov/api/prod/). NOAA documents per-request retrieval limits, but the reviewed docs do not publish a universal per-client requests-per-second quota. Use date-range requests, the spec's 6-hour prediction cache, and low request concurrency.

## Hindcast archive inventory

This is source availability, not a claim that a complete 2025 station-year has already passed the A5 coverage gate.

| Source and fields | History/access established | Limits and known gaps |
|---|---|---|
| NWS current hourly and grid forecasts: temperature, wind, gust, direction, PoP, thunder; optional grid wave height | api.weather.gov points and forecast URLs are live operational products, with about a seven-day forecast horizon. | The operational API does not provide historical issue-time snapshots. It cannot recreate the exact hourly forecast/issuance the app would have consumed in 2025. NCEI's separate NDFD gridded forecast archive is a **candidate**, not yet coverage-verified for JAX cells and waveHeight: [NCEI NDFD access](https://www.ncei.noaa.gov/products/weather-climate-models/national-digital-forecast-database) lists about ten years online, older records through AIRS, and AWS data from April 2020. NDFD is not proof of exact api.weather.gov forecast replay. |
| NWS station observations: pressure history, temperature, wind/gust, present weather | /stations/{id}/observations is a recent observation service; for full-year historical land observations, NCEI Global Hourly / ISD offers an archive with period of record 1901–present and downloadable station records: [ISD](https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database). | Coverage is station/field/year-specific. The nearest API station KFIN (Flagler County Airport) was returned by the current NWS station list, but its exact 2025 ISD key, pressure/gust rows, missing hours, and QC completeness remain to be frozen. ISD is not a history of NWS forecast/alert issuances. |
| NWS alerts | Active alerts can be queried now by point from the [NWS Alerts API](https://www.weather.gov/documentation/services-web-alerts). | No equivalent archive of every historical active-alert snapshot was verified. Historical alert-checked state cannot be reconstructed from this endpoint. Per ADR §5, the hindcast must label alerts assumed checked/none. |
| CO-OPS tide predictions: hilo times/heights | All 12 catalog station IDs list Tide Predictions. Historic dates are queryable; station 8721120 returned 2025-10-05/06 predictions. Access: Data API product=predictions, GMT, MLLW, interval=hilo. | Generated harmonic predictions, not historical prediction issue-time versions or observed water levels. Requests have per-request size limits; request only the required padded date window and cache six hours. |
| CO-OPS water temperature / meteorology | Station 8720218 lists Meteorological and returned 2025 and current-year temperature rows through product=water_temperature; exact sensor history must be checked before choosing it for a hindcast. | It is outside the active launch catalog's water-temperature configuration. No active spot has a CO-OPS water-temp station assigned. Station-period gaps and sensor start dates have not been established. |
| NDBC 41117 (CDIP 194): significant wave height, wave period/direction and water temperature; standard met observations | NDBC station history lists standard-meteorological annual files for **2017–2025**; station's data descriptions document fields and units. Access: compressed annual files under [NDBC historical data](https://www.ndbc.noaa.gov/historical_data.shtml) / [41117 station history](https://www.ndbc.noaa.gov/station_history.php?station=41117). Current API fallback api/live/marine.json is a scheduled latest snapshot, not an old snapshot archive. | The 2017–2025 year listing is not proof every variable is populated continuously. Parse sentinels/QC flags, inspect year/month gaps and station maintenance intervals. NDBC buoy wind/pressure are offshore conditions, not interchangeable with KFIN land readings. |
| CDIP 194 historic waves and water temperature | CDIP describes archived historic files containing wave spectra/parameters across deployments and provides THREDDS/OPeNDAP and ERDDAP access. The live SECOORA mirror returned wave and temperature rows at 2026-10-05 18:00Z/18:28Z. See [CDIP data access](https://cdip.ucsd.edu/m/documents/data_access.html), [historic archive](https://cdip.ucsd.edu/homepage.php?nav=historic&sub=data), and [THREDDS](https://thredds.cdip.ucsd.edu/thredds/catalog/cdip/archive/catalog.html). | CDIP's program archive starts in 1975, but that is not the start date of station 194; exact station-194 deployment history, variable coverage, QC and gaps still need inventory. The SECOORA buoyUrls() real-time request filters to the last six hours and is not itself a year-archive query. |

NDBC publishes compressed station/year files; CDIP offers read-only archive downloads; no numeric public request-rate quota was found in the reviewed NDBC/CDIP docs. Avoid bulk live polling; A5 should download only the selected year/stations and retain their source manifests/checksums. NWS API caching follows the spec (points 7 days/stale-on-error to 30 days; hourly/grid 30 minutes; alerts 10 minutes; station readings 15 minutes). CO-OPS predictions use the specified 6-hour TTL; buoy observations use 30 minutes and cannot satisfy tomorrow's wave gate. In the browser the NDBC fallback resolves to the app's api/live/marine.json path; in Node it uses the public Pages URL unless the caller injects ndbcUrl.

**Full-year gaps to carry into A5:** exact historical NWS hourly forecasts and alerts cannot be reproduced from their live endpoints; NDFD is a separate forecast-archive candidate and needs JAX grid/field/issuance validation. NWS pressure archive station-year completeness is unverified. CO-OPS temperature is not wired to any active spot. NDBC/CDIP annual availability is promising but gaps/QC and station-specific first/last sample dates still require a measured coverage report. A complete observation-based 2025 run may use NDBC/ISD/CO-OPS predictions under the explicit hindcast-perfect-observation label; missing inputs remain missing, and it is not forecast-skill evidence.

## Normalized input recorder design

engine/recorder.js exports recordNormalizedInputs({run, inputs, pendingPredictions}). It:

1. Projects each result (including failed/missing sources and safeErrorCode) to the A1 normalized-observation fields; recursively canonicalizes object keys and sorts whole records, so network completion order cannot change the bytes.
2. SHA-256 hashes each canonical record. The first copy carries the normalized record plus inputHash; identical repeats carry {inputHash, duplicateOf} pointing to the first hash. Distinct intervals/values are not collapsed.
3. Emits deterministic newline-delimited JSON and a SHA-256 for those exact inputsNdjson bytes, alongside run ID/time, input count and sorted pending prediction markers.
4. Uses browser/Node Web Crypto only; it has no filesystem, network or remote-write side effects. A4 can persist the returned NDJSON into its inputs.ndjson archive member and verify the whole-file hash on restore.

Until A3 prediction integration exists the stub labels its output inputs-recorded-predictions-pending; it never fabricates a prediction. A4 should pass the exact normalized outputs used by both horizons once, with every unavailable/error observation included.

## Implementation assumptions and findings

- Marine points are derived from the spot coordinate by a 0.05° eastward longitude offset. All six active ocean locations resolved as type=marine and had covered waves on the check date. This fixed-offset mapping is an A2 working assumption because the catalog has no separate marine coordinates; verify the offset/grid selection before changing locations or broadening the region.
- Grid waveHeight is significant wave height in meters. The field can contain long intervals; coverage must be calculated from valid-time intervals, not by counting values or assuming hourly resolution.
- Pressure trend uses NWS observations from up to 12 rows. If current station rows do not include enough recent timestamps for the 3-hour/6-hour deltas, report the factor unavailable; do not fill from forecasts.
- There is no contradiction with ADR H7: a recent, full-window tomorrow wave forecast is available for the tested issuance, and the pipeline keeps the explicit MAYBE cap when that requirement is stale/missing.
