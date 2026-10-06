import { fetchJson, failure, isStale, NWS_HEADERS, observation, parseDurationMs } from "./shared.js";

const FIELDS = ["temperature", "windSpeed", "windDirection", "windGust", "probabilityOfPrecipitation", "probabilityOfThunder"];

export async function fetchNwsGridForecast(location, { points, fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const locationId = location?.id ?? points?.locationId ?? null, url = points?.values?.forecastGridData;
  if (!url) return failure({ provider: "nws", kind: "gridForecast", locationId }, "NWS land gridpoint URL unavailable");
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    const p = json?.properties;
    if (!p) throw new Error("NWS gridpoint response properties missing");
    const values = Object.fromEntries(FIELDS.map(field => {
      const source = p[field];
      return [field, Array.isArray(source?.values) ? source.values.map(item => {
        const [start, duration] = String(item.validTime ?? "").split("/");
        const from = Date.parse(start), durationMs = parseDurationMs(duration);
        let value = item.value;
        if (value === null || value === undefined || !Number.isFinite(Number(value))) value = null;
        else {
          value = Number(value);
          if (field === "temperature" && source.uom === "wmoUnit:degC") value = value * 9 / 5 + 32;
          if ((field === "windSpeed" || field === "windGust") && source.uom === "wmoUnit:km_h-1") value *= 0.6213711922;
        }
        return { validFrom: Number.isFinite(from) ? new Date(from).toISOString() : null,
          validTo: Number.isFinite(from) && Number.isFinite(durationMs) ? new Date(from + durationMs).toISOString() : null, value };
      }) : []];
    }));
    const times = FIELDS.flatMap(field => values[field]).filter(x => x.validFrom && x.validTo);
    const starts = times.map(x => Date.parse(x.validFrom)), ends = times.map(x => Date.parse(x.validTo));
    return observation({ provider: "nws", kind: "gridForecast", locationId, station: points.station, url, fetchedAt: new Date(now).toISOString(),
      issuedAt: p.updateTime ?? null, validFrom: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
      validTo: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
      units: { temperature: "°F", windSpeed: "mph", windGust: "mph", windDirection: "degrees", probabilityOfPrecipitation: "%", probabilityOfThunder: "%" },
      values, stale: isStale(p.updateTime, 6 * 3600000, now) });
  } catch (error) { return failure({ provider: "nws", kind: "gridForecast", locationId, station: points?.station, url }, error); }
}
