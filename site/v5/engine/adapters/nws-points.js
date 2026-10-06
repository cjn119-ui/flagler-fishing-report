import { fetchJson, failure, isStale, NWS_BASE, NWS_HEADERS } from "./shared.js";

const cache = new Map();
const TTL = 7 * 86400000;
const STALE_MAX = 30 * 86400000;
export function clearNwsPointsCache() { cache.clear(); }

export async function fetchNwsPoints(location, { fetchImpl, now = Date.now(), timeoutMs = 8000, force = false, marine = false, coordinates = null } = {}) {
  const locationId = location?.id ?? null;
  const lat = Number(coordinates?.lat ?? location?.lat), lon = Number(coordinates?.lon ?? location?.lon);
  const key = (locationId ?? "point") + ":" + lat.toFixed(4) + "," + lon.toFixed(4);
  const url = NWS_BASE + "/points/" + lat + "," + lon;
  const cached = cache.get(key);
  if (cached && !force && !isStale(cached.fetchedAt, TTL, now)) return { ...cached, url, cacheHit: true };
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    const p = json?.properties;
    if (!p?.forecastGridData || (!marine && (!p?.forecastHourly || !p?.observationStations))) throw new Error("NWS points response lacks required links");
    const fetchedAt = new Date(now).toISOString();
    const result = { provider: "nws", kind: "points", locationId, station: p.gridId + "/" + p.gridX + "," + p.gridY, url,
      fetchedAt, issuedAt: null, observedAt: null, validFrom: null, validTo: null,
      values: { forecastHourly: p.forecastHourly ?? null, forecastGridData: p.forecastGridData,
        observationStations: p.observationStations ?? null,
        gridId: p.gridId, gridX: p.gridX, gridY: p.gridY, forecastZone: p.forecastZone, county: p.county },
      units: null, ok: true, stale: false, usedFallback: false, error: null, cacheHit: false };
    cache.set(key, result);
    return result;
  } catch (error) {
    if (cached && now - Date.parse(cached.fetchedAt) <= STALE_MAX) return { ...cached, url, ok: true, stale: true, cacheHit: true, error: String(error.message ?? error) };
    return failure({ provider: "nws", kind: "points", locationId, url }, error);
  }
}
