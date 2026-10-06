import { fetchJson, failure, isStale, NWS_HEADERS, observation } from "./shared.js";

export async function fetchNwsHourly(location, { points, fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const url = points?.values?.forecastHourly, locationId = location?.id ?? points?.locationId ?? null;
  if (!url) return failure({ provider: "nws", kind: "hourlyForecast", locationId }, "NWS hourly forecast URL unavailable");
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    const p = json?.properties;
    if (!Array.isArray(p?.periods)) throw new Error("NWS hourly periods missing");
    const values = p.periods.map(x => ({ startTime: x.startTime, endTime: x.endTime, temperature: x.temperature,
      temperatureUnit: x.temperatureUnit, windSpeed: x.windSpeed, windDirection: x.windDirection, probabilityOfPrecipitation: x.probabilityOfPrecipitation?.value ?? null,
      shortForecast: x.shortForecast ?? null, isDaytime: x.isDaytime }));
    const issuedAt = p.updateTime ?? p.generatedAt ?? null;
    return observation({ provider: "nws", kind: "hourlyForecast", locationId, station: points.station, url, fetchedAt: new Date(now).toISOString(),
      issuedAt, validFrom: values[0]?.startTime ?? null, validTo: values.at(-1)?.endTime ?? null,
      units: "NWS quantitative values; windSpeed mph text; temperature °F", values: { rows: values }, stale: isStale(issuedAt, 6 * 3600000, now) });
  } catch (error) { return failure({ provider: "nws", kind: "hourlyForecast", locationId, station: points?.station, url }, error); }
}
