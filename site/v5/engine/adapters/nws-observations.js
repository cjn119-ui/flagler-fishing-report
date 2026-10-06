import { fetchJson, failure, isStale, NWS_HEADERS, observation } from "./shared.js";

export async function fetchNwsObservations(location, { points, fetchImpl, now = Date.now(), timeoutMs = 8000, limit = 12 } = {}) {
  const locationId = location?.id ?? points?.locationId ?? null, url = points?.values?.observationStations;
  if (!url) return failure({ provider: "nws", kind: "pressureObservations", locationId }, "NWS observation-station URL unavailable");
  let stationId = null;
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    const stationUrl = json?.observationStations?.[0];
    if (!stationUrl) throw new Error("NWS observation station list is empty");
    stationId = String(stationUrl).split("/").at(-1);
    const observationsUrl = "https://api.weather.gov/stations/" + encodeURIComponent(stationId) + "/observations?limit=" + Math.min(12, Math.max(1, limit));
    const { json: data } = await fetchJson(observationsUrl, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    if (!Array.isArray(data?.features)) throw new Error("NWS station observations missing features");
    const values = data.features.map(f => ({ time: f.properties?.timestamp, pressurePa: f.properties?.barometricPressure?.value ?? null,
      temperatureC: f.properties?.temperature?.value ?? null, windSpeedMs: f.properties?.windSpeed?.value ?? null,
      windGustMs: f.properties?.windGust?.value ?? null, textDescription: f.properties?.textDescription ?? null }))
      .sort((a, b) => Date.parse(b.time ?? "") - Date.parse(a.time ?? ""));
    return observation({ provider: "nws", kind: "pressureObservations", locationId, station: stationId, url: observationsUrl,
      fetchedAt: new Date(now).toISOString(), observedAt: values[0]?.time ?? null, values: { rows: values }, units: "pressure Pa; temperature °C; wind m/s",
      stale: isStale(values[0]?.time, 6 * 3600000, now) });
  } catch (error) { return failure({ provider: "nws", kind: "pressureObservations", locationId, station: stationId, url }, error); }
}
