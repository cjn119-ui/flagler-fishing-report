# V5 data-source expansion

Status: source inventory added 2026-10-27. This is a ranked integration backlog, not a claim that these providers are already queried by V5. See the machine-readable catalog at `site/v5/data/data-sources.json`.

## Prediction goal

Estimate a calibrated percentage for each **species × fishing location × local one-hour interval**: the probability of at least one fish of that species being caught during that hour. The estimate must be conditioned on fishing mode and recorded effort/technique, alongside time of year and environmental conditions. This is the desired output, not a capability V5 currently has.

The model needs both successful and no-catch fishing intervals. A catch log that records only catches cannot estimate the denominator. Log where and when fishing occurred, species sought, effort, technique/gear, and intervals with no catch; use explicit consent before contributing personal logs to shared training data. For fair comparisons, account for differences in anglers, effort, access, mode, and survey design.

Environmental, water-quality, hydrologic, habitat, and survey sources are explanatory features or species-presence context; by themselves they do not label an angler's hourly catch outcome. MRIP and FWC FIM are sampled surveys at broader spatial/temporal grains and must not be presented as point-hour catch probabilities without a validated mapping. Each probability needs calibration evidence and uncertainty bounds for its species/location/hour segment. Where support is weak, return “insufficient data” rather than a precise percentage.

| Rank | Data source | New information | Best application | Priority |
|---:|---|---|---|---|
| 1 | GTM Reserve water-quality network | Salinity, dissolved oxygen, turbidity, water temperature | Inshore | Critical |
| 2 | FWC Fisheries-Independent Monitoring | Species abundance, size, habitat and sampling context | Inshore, seasonal models | Critical |
| 3 | NOAA MRMS rainfall estimates | Observed/analyzed rainfall aggregated across connected watersheds | Inshore | Very high |
| 4 | Verified fishing-trip outcomes | Catch/no-catch, effort, technique, species and size | All modes | Critical |
| 5 | USGS / SJRWMD hydrologic monitoring | Water level, discharge and freshwater changes | Inshore | Very high |
| 6 | NOAA observed water levels | Actual levels and residuals against predicted tides | Inshore, inlet | High |
| 7 | NOAA / FDEP coastal elevation surveys | Bathymetry, beach profiles and coastal structure | Surf | High |
| 8 | NOAA CoastWatch satellite data | Chlorophyll, optical clarity proxies and water-mass changes | Surf, nearshore | Medium |
| 9 | Florida DEP water-quality archives | Historical chemistry, nutrients and sediment | Inshore, historical modeling | Medium |

## Integration order and gates

1. **Station and feature coverage first.** Inventory GTM, FIM, CO-OPS, USGS and SJRWMD stations against V5 spots and the Florida point path. Record distance, habitat, sampling interval, units, datum, QA/QC status, and missingness before adding any score contribution.
2. **Add observational series with provenance.** GTM sensor series, CO-OPS observed water levels, and matched hydrologic series should use the existing normalized observation envelope and explicit provider/station/time metadata. Keep forecasts, observations, and historical survey features distinguishable.
3. **Build geospatial pipelines for gridded/archive sources.** MRMS rainfall must be accumulated over connected upstream watersheds. CoastWatch requires product selection, quality-mask handling, and pixel-age checks. Coastal profiles and FDEP archives are periodic or discrete context, not live observations.
4. **Build the outcome denominator.** Extend the opt-in outcome record to include each fished hour, including no-catch hours, effort, target species, mode, technique/gear, location precision, and timestamp. Define verification, duplicates, and consent before aggregating records.
5. **Validate before showing probabilities.** Evaluate the species × location × hour predictions on held-out future periods and locations. Report calibration, Brier/log loss, sample sizes, and uncertainty. Keep current suitability and safety gates separate until probability performance supports a product decision. FIM abundance is a survey index, not an angler catch probability; do not apply a source as a scoring feature just because it is available.

## Source-access notes

- The GTM Reserve is part of NERRS SWMP; use CDMO station/parameter metadata and QA flags. CDMO documents that automated web-service access requires authorization and a static IP.
- FWC's inshore FIM records are served from an ArcGIS query layer with sampling date, location, gear, species, total count, and size fields. Retain survey design fields when aggregating.
- NOAA MRMS and Stage IV products are gridded files rather than a simple point API. The watershed calculation and reprojection/aggregation belong in a backend/offline pipeline, not a mobile fetch.
- Use modern USGS Water Data APIs; USGS says legacy WaterServices will be decommissioned in 2027. SJRWMD data are available through district hydrologic search tools; verify station export contracts before automating.
- NOAA CO-OPS observations and predictions need station, time zone, datum, preliminary/verified status, and matching timestamps before calculating residuals.
- FDEP beach profile files and NOAA coastal lidar/bathymetry products have varying survey dates, spatial coverage, projections, and vertical datums.
- CoastWatch ERDDAP products have their own spatial resolution, observation time, and quality flags. Do not treat cloud-masked or stale satellite pixels as current clear water.
- FDEP's Watershed Information Network is the current system for non-regulatory discrete water-quality data; STORET is a legacy archive. Normalize methods, reporting limits, units, and quality flags before historical modeling.

## Authoritative access references

- [NERRS CDMO data and web services](https://nerrsdata.org/webservices.cfm)
- [FWC Fisheries-Independent Monitoring](https://myfwc.com/research/saltwater/fim/) and [inshore FIM query layer](https://gis.myfwc.com/hosting/rest/services/Open_Data/Inshore_Saltwater_FIM_Stratified_Random_Sampling/MapServer/1)
- [NOAA MRMS](https://inside.nssl.noaa.gov/mrms/) and [NOAA precipitation data access](https://api.water.noaa.gov/about/precipitation-data-access)
- [USGS Water Data APIs](https://api.waterdata.usgs.gov/docs/) and [SJRWMD data portal](https://www.sjrwmd.com/data/)
- [NOAA CO-OPS web services](https://www.tidesandcurrents.noaa.gov/web_services_info.html)
- [FDEP coastal monitoring data](https://floridadep.gov/rcp/beach-survey-services/content/regional-coastal-monitoring-data) and [NOAA Bathymetric Data Viewer](https://coastalscience.noaa.gov/products/noaa-bathymetric-data-viewer/)
- [NOAA CoastWatch East Coast data access](https://eastcoast.coastwatch.noaa.gov/cw_data_access.php)
- [FDEP Watershed Information Network](https://floridadep.gov/dear/watershed-information-network)
