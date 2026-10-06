import { fetchJson, failure, isStale, NWS_HEADERS, observation, parseDurationMs } from "./shared.js";

export async function fetchNwsWaveForecast(location, { points, fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const locationId = location?.id ?? points?.locationId ?? null, url = points?.values?.forecastGridData;
  if (!url) return failure({ provider: "nws", kind: "waveForecast", locationId }, "NWS gridpoint URL unavailable");
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    const p = json?.properties, field = p?.waveHeight;
    if (!Array.isArray(field?.values)) throw new Error("NWS gridpoint waveHeight unavailable");
    const values = field.values.map(item => {
      const [start, duration] = String(item.validTime ?? "").split("/");
      const from = Date.parse(start), durationMs = parseDurationMs(duration);
      return { validFrom: Number.isFinite(from) ? new Date(from).toISOString() : null,
        validTo: Number.isFinite(from) && Number.isFinite(durationMs) ? new Date(from + durationMs).toISOString() : null,
        waveHeightM: item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value)) ? Number(item.value) : null };
    });
    const issuedAt = p.updateTime ?? p.validTimes ?? null;
    return observation({ provider: "nws", kind: "waveForecast", locationId, station: points?.station, url,
      fetchedAt: new Date(now).toISOString(), issuedAt, validFrom: values[0]?.validFrom ?? null, validTo: values.at(-1)?.validTo ?? null,
      units: field.uom ?? null, values, stale: isStale(issuedAt, 6 * 3600000, now) });
  } catch (error) { return failure({ provider: "nws", kind: "waveForecast", locationId, station: points?.station, url }, error); }
}

export function waveCoverage(observation, start, end) {
  if (!observation?.ok || observation.stale || !Array.isArray(observation.values)) return false;
  const intervals = observation.values.filter(v => Number.isFinite(v.waveHeightM) && v.validFrom && v.validTo)
    .map(v => [Date.parse(v.validFrom), Date.parse(v.validTo)]).sort((a,b) => a[0]-b[0]);
  let coveredUntil = Date.parse(start);
  for (const [from, to] of intervals) {
    if (to <= coveredUntil || from > coveredUntil) continue;
    coveredUntil = Math.max(coveredUntil, to);
    if (coveredUntil >= Date.parse(end)) return true;
  }
  return false;
}
