import { COOPS_URL, fetchJson, failure, isStale, observation } from "./shared.js";

export async function fetchCoopsWaterTemperature(location, { fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const station = String(location?.waterTemp ?? ""), locationId = location?.id ?? null;
  if (!station) return failure({ provider: "coops", kind: "waterTemperature", locationId }, "No CO-OPS water-temperature station configured");
  const ymdhm = d => d.getUTCFullYear() + String(d.getUTCMonth()+1).padStart(2,"0") + String(d.getUTCDate()).padStart(2,"0") + " " + String(d.getUTCHours()).padStart(2,"0") + ":" + String(d.getUTCMinutes()).padStart(2,"0");
  const qs = new URLSearchParams({ product: "water_temperature", application: "FlaglerFishingReportV5",
    begin_date: ymdhm(new Date(now - 6 * 3600000)), end_date: ymdhm(new Date(now)), station, units: "metric", time_zone: "gmt", format: "json" });
  const url = COOPS_URL + "?" + qs;
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
    if (!Array.isArray(json?.data)) throw new Error(json?.error?.message ?? "CO-OPS water-temperature rows missing");
    const values = json.data.map(row => ({ time: parseTime(row.t), temperatureC: Number(row.v), quality: row.f ?? null }))
      .filter(x => x.time && Number.isFinite(x.temperatureC));
    return observation({ provider: "coops", kind: "waterTemperature", locationId, station, url, fetchedAt: new Date(now).toISOString(),
      observedAt: values.at(-1)?.time ?? null, validFrom: values[0]?.time ?? null, validTo: values.at(-1)?.time ?? null,
      units: "°C", values, stale: isStale(values.at(-1)?.time, 3 * 3600000, now) });
  } catch (error) { return failure({ provider: "coops", kind: "waterTemperature", locationId, station, url }, error); }
}
function parseTime(value) { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(value ?? ""); return m ? new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5])).toISOString() : null; }
