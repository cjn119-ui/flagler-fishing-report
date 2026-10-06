import { fetchJson, failure, NWS_BASE, NWS_HEADERS, observation } from "./shared.js";

export async function fetchNwsAlerts(location, { fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const lat = Number(location?.marineLat ?? location?.lat), lon = Number(location?.marineLon ?? location?.lon), locationId = location?.id ?? null;
  const url = NWS_BASE + "/alerts/active?point=" + lat + "," + lon;
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs, headers: NWS_HEADERS });
    if (!Array.isArray(json?.features)) throw new Error("NWS alerts response missing features");
    const alerts = json.features.map(f => ({ id: f.id, event: f.properties?.event, severity: f.properties?.severity,
      urgency: f.properties?.urgency, certainty: f.properties?.certainty, effective: f.properties?.effective,
      expires: f.properties?.expires, onset: f.properties?.onset, ends: f.properties?.ends,
      headline: f.properties?.headline, description: f.properties?.description }));
    return observation({ provider: "nws", kind: "alerts", locationId, url, fetchedAt: new Date(now).toISOString(), values: { rows: alerts } });
  } catch (error) { return failure({ provider: "nws", kind: "alerts", locationId, url }, error); }
}
