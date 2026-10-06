import { fetchJson, failure, isStale, observation } from "./shared.js";

export const DEFAULT_NDBC_URL = import.meta.url.startsWith("file:")
  ? "https://cjn119-ui.github.io/flagler-fishing-report/api/live/marine.json"
  : new URL("../../../api/live/marine.json", import.meta.url).href;
export async function fetchNdbcFallback(location, { fetchImpl, now = Date.now(), timeoutMs = 8000, url = DEFAULT_NDBC_URL } = {}) {
  const locationId = location?.id ?? null, station = String(location?.buoy ?? "");
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
    const observedAt = json?.observed_at ?? json?.observedAt ?? null, raw = json?.values ?? json?.data ?? json;
    const values = { waveHeightM: numberOrNull(raw?.wave_height_m ?? raw?.WVHT ?? raw?.waveHeightM),
      periodS: numberOrNull(raw?.dominant_period_s ?? raw?.DPD ?? raw?.periodS),
      directionDeg: numberOrNull(raw?.wave_direction_deg ?? raw?.MWD ?? raw?.directionDeg),
      temperatureC: numberOrNull(raw?.water_temperature_c ?? raw?.WTMP ?? raw?.temperatureC) };
    if (!Object.values(values).some(Number.isFinite)) throw new Error("NDBC marine snapshot contains no usable values");
    return observation({ provider: "ndbc", kind: "marineObservation", locationId, station, url, observedAt,
      fetchedAt: new Date(now).toISOString(), units: "m, s, degrees, °C", values, stale: !observedAt || isStale(observedAt, 3 * 3600000, now), usedFallback: true });
  } catch (error) { return failure({ provider: "ndbc", kind: "marineObservation", locationId, station, url, usedFallback: true }, error); }
}
function numberOrNull(value) { const n = Number(value); return value == null || !Number.isFinite(n) || n >= 99 ? null : n; }
