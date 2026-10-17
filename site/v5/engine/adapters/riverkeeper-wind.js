import { fetchJson, failure, isStale, observation } from "./shared.js";

// Matanzas Riverkeeper weather station (FAU) on the Matanzas River, published through SECOORA ERDDAP.
// 5-minute mean/max wind over the water. The anemometer is sheltered and reads well below open-air
// stations, so run.js only uses it when no airport observation is fresh.
export const RIVERKEEPER_MAX_MILES = 10;
export const RIVERKEEPER = Object.freeze({ id: "matanzas-riverkeeper", lat: 29.7672, lon: -81.2561 });
const URL_BASE = "https://erddap.secoora.org/erddap/tabledap/matanzas-riverkeeper.json";
const FIELDS = ["time", "wind_speed_cm_time__mean_over_pt5m", "wind_speed_cm_time__maximum_over_pt5m",
  "wind_from_direction_cm_time__mean_over_pt5m", "wind_speed_cm_time__mean_over_pt5m_qc_agg"];

export const riverkeeperUrl = () => `${URL_BASE}?${FIELDS.join(",")}&time%3E=now-3hours`;

export async function fetchRiverkeeperWind(location, { fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const locationId = location?.id ?? null, url = riverkeeperUrl();
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
    const columns = json?.table?.columnNames, rows = json?.table?.rows;
    if (!Array.isArray(columns) || !Array.isArray(rows)) throw new Error("Riverkeeper table format missing");
    const i = Object.fromEntries(columns.map((x, n) => [x, n])), num = v => v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
    const values = rows.map(r => ({ time: r[i.time], windSpeedMs: num(r[i.wind_speed_cm_time__mean_over_pt5m]),
      windGustMs: num(r[i.wind_speed_cm_time__maximum_over_pt5m]), windDirectionDeg: num(r[i.wind_from_direction_cm_time__mean_over_pt5m]),
      qc: num(r[i.wind_speed_cm_time__mean_over_pt5m_qc_agg]) }))
      .filter(r => r.windSpeedMs !== null && (r.qc === null || r.qc === 1 || r.qc === 2) && Number.isFinite(Date.parse(r.time)))
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    if (!values.length) throw new Error("Riverkeeper has no usable wind rows");
    return observation({ provider: "matanzas-riverkeeper", kind: "windObservations", locationId, station: RIVERKEEPER.id, url,
      fetchedAt: new Date(now).toISOString(), observedAt: values[0].time, units: "wind m/s; direction degrees", values: { rows: values },
      stale: isStale(values[0].time, 3 * 3600000, now) });
  } catch (error) { return failure({ provider: "matanzas-riverkeeper", kind: "windObservations", locationId, station: RIVERKEEPER.id, url }, error); }
}
