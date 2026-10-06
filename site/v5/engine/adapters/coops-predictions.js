import { COOPS_URL, fetchJson, failure, observation } from "./shared.js";

export async function fetchCoopsPredictions(location, { fetchImpl, now = Date.now(), timeoutMs = 8000, beginDate, endDate } = {}) {
  const station = String(location?.tide ?? ""), locationId = location?.id ?? null;
  const ymd = d => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  const start = beginDate ?? ymd(new Date(now - 86400000)), end = endDate ?? ymd(new Date(now + 2 * 86400000));
  const qs = new URLSearchParams({ product: "predictions", application: "FlaglerFishingReportV5", begin_date: start, end_date: end,
    station, datum: "MLLW", units: "english", time_zone: "gmt", interval: "hilo", format: "json" });
  const url = COOPS_URL + "?" + qs;
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
    if (!Array.isArray(json?.predictions)) throw new Error(json?.error?.message ?? "CO-OPS prediction rows missing");
    const values = json.predictions.map(row => ({ time: parseCoopsGmt(row.t), type: row.type, heightFt: Number(row.v) }));
    return observation({ provider: "coops", kind: "tidePredictions", locationId, station, url, fetchedAt: new Date(now).toISOString(),
      validFrom: values[0]?.time ?? null, validTo: values.at(-1)?.time ?? null, units: "ft MLLW; timestamps UTC", values });
  } catch (error) { return failure({ provider: "coops", kind: "tidePredictions", locationId, station, url }, error); }
}

export function parseCoopsGmt(value) {
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/.exec(value ?? "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString() : null;
}
