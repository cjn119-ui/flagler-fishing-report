import { buoyUrls } from "../../spots.js";
import { fetchJson, failure, isStale, observation } from "./shared.js";

export async function fetchSecoora(location, { fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const locationId = location?.id ?? null, station = String(location?.cdip ?? "");
  if (!station) return { waves: failure({ provider: "secoora", kind: "waves", locationId }, "No CDIP station configured"),
    water: failure({ provider: "secoora", kind: "waterTemperature", locationId }, "No CDIP station configured") };
  const urls = buoyUrls(station);
  const [waves, water] = await Promise.all([getTable(urls.waves, "waves"), getTable(urls.water, "water")]);
  return { waves, water };
  async function getTable(url, type) {
    try {
      const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
      const columns = json?.table?.columnNames, rows = json?.table?.rows;
      if (!Array.isArray(columns) || !Array.isArray(rows)) throw new Error("SECOORA table format missing");
      const index = Object.fromEntries(columns.map((x, i) => [x, i]));
      const row = rows.at(-1);
      if (!row) throw new Error("SECOORA table has no data rows");
      const observedAt = row[index.time] ?? null;
      const values = type === "waves" ? { waveHeightM: finite(row[index.sea_surface_wave_significant_height]),
        periodS: finite(row[index.sea_surface_wave_period_at_variance_spectral_density_maximum]), directionDeg: finite(row[index.sea_surface_wave_from_direction]) }
        : { temperatureC: finite(row[index.sea_water_temperature]) };
      if (!Object.values(values).some(Number.isFinite)) throw new Error("SECOORA row has no finite requested values");
      return observation({ provider: "secoora", kind: type === "waves" ? "waves" : "waterTemperature", locationId, station,
        url, observedAt, fetchedAt: new Date(now).toISOString(), units: type === "waves" ? "m, s, degrees" : "°C",
        values, stale: !observedAt || isStale(observedAt, 3 * 3600000, now) });
    } catch (error) { return failure({ provider: "secoora", kind: type === "waves" ? "waves" : "waterTemperature", locationId, station, url }, error); }
  }
}
function finite(value) { const n = Number(value); return value === null || value === undefined || !Number.isFinite(n) ? null : n; }
