# V5 hindcast source acquisition

Fetch the year `2025-10-01T00:00:00Z` through (exclusive) `2026-10-01T00:00:00Z`, the 12 months ending 2026-09-30 UTC:

```sh
node scripts/hindcast/fetch-hindcast-data.mjs --dry-run
node scripts/hindcast/fetch-hindcast-data.mjs
node scripts/test-hindcast-data.mjs
```

The fetcher uses only read-only public GETs, identifies itself with a descriptive User-Agent, waits at least one second between uncached requests to a host, and caches raw bodies by URL SHA-256 in ignored `.cache/hindcast/raw/`. A rerun reuses those bodies. Delete that cache only when intentionally refreshing the archive. `MANIFEST.json` captures each exact request URL (the reusable URL pattern with this window's date parameters), fetch time, normalized row count, time bounds, per-month occupied-hour coverage, intervals between rows over three hours, units, optional CO-OPS products and limitations. Exact URLs and cache state are also in the manifest for reproducibility. For sparse CO-OPS hilo data, these intervals reflect the normal roughly four daily tide extrema; they are not automatically missing-data gaps.

## Sources and join

- KFIN, Flagler County Airport: Iowa Environmental Mesonet ASOS archive (`sknt`, `gust`, `drct`, `p01i`, `alti`, `mslp`, `wxcodes`, METAR/SPECI report types). Irregular reports are reduced to one record per UTC hour using the last report in that hour. Wind is in knots, precipitation in inches, and pressures in inHg; weather codes are observed conditions. `p01i` is the one-hour precipitation for the period since the station's prior hourly reset; reset times vary slightly by site. There is no fallback to a forecast archive because this task specifically substitutes observed values.
- Tides: NOAA CO-OPS predictions, `interval=hilo`, `time_zone=gmt`, `datum=MLLW`, one request per distinct active catalog station. These are date-calculated harmonic predictions, not a stored historical forecast issuance and not measured water levels. The distinct station set is derived from active `spots.js` rows.
- Waves and water temperature: CDIP 194 via SECOORA ERDDAP historical tabledap, joined by UTC timestamp. Significant wave height is metres, periods seconds, wave direction degrees, water temperature Celsius. Aggregate QARTOD values are retained. CDIP 194 is the historical archive for the same offshore buoy also known as NDBC 41117. The join is temporal only: one offshore buoy is not a station at each fishing spot. No NDBC annual files are downloaded because the CDIP archive supplies this year window and the associated temperature series in one queried dataset.
- CO-OPS temperature and meteorological products are queried only when station products metadata advertises them. Unsupported offerings are recorded in the manifest. No separate NOAA/NWS precipitation forecast is downloaded: observed KFIN precipitation is the explicit rain proxy.

## What this dataset cannot claim

Past NWS forecast issuances and historical alert snapshots are not reconstructed. Observed wind, rain, pressure, waves and weather codes used as future-slot stand-ins make this a perfect-observation sensitivity hindcast, not evidence of forecast skill, real forecast availability, catches, calibrated probabilities, station-level representativeness or operational safety. The alert state is assumed checked/none, as required by the scenario, rather than asserted as recovered history. Missing hours remain missing; no long-gap interpolation, repeated days, or synthetic seasonal inputs are created. The source manifest is an acquisition/coverage report, not an A5 acceptance result.
