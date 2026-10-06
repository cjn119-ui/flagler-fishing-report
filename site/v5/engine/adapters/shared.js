export const NWS_BASE = "https://api.weather.gov";
export const COOPS_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
export const NWS_HEADERS = {
  Accept: "application/geo+json, application/json",
  "User-Agent": "FlaglerFishingReport-V5/1.0 (public research; https://github.com/cjn119/flagler-fishing-report)",
};

export function observation({
  provider, kind, locationId = null, station = null, url = null, observedAt = null,
  issuedAt = null, validFrom = null, validTo = null, fetchedAt = new Date().toISOString(),
  units = {}, values = {}, ok = true, stale = false, usedFallback = false, error = null,
}) {
  const safeErrorCode = error ? "source_unavailable" : null;
  return { provider, source: provider, kind, locationId, station, url, observedAt, issuedAt, validFrom, validTo, fetchedAt,
    units: units ?? {}, values: values ?? {}, ok, stale: Boolean(stale), usedFallback: Boolean(usedFallback),
    safeErrorCode, error: error ? String(error).slice(0, 240) : null };
}

export async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 8000, headers = {}, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers, signal: signal ?? controller.signal });
    if (!response?.ok) throw new Error("HTTP " + (response?.status ?? "failure"));
    return { json: await response.json(), response };
  } finally { clearTimeout(timer); }
}

export function failure(args, error) {
  return observation({ ...args, ok: false, values: {}, error: error?.message ?? error ?? "Source unavailable" });
}
export function iso(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function isStale(timestamp, ttlMs, now = Date.now()) {
  const at = Date.parse(timestamp ?? "");
  return !Number.isFinite(at) || now - at > ttlMs;
}
export function parseDurationMs(value) {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value ?? "");
  if (!m) return null;
  const [days, hours, minutes, seconds] = m.slice(1).map(x => Number(x ?? 0));
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}
