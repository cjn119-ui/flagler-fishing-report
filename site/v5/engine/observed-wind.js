// Observed wind for the slot containing "now". Airport (NWS) first; the sheltered Matanzas Riverkeeper river station
// only when no airport reading is fresh. Anything outside the current slot, or older than 90 minutes, stays on the forecast.
const has = (n) => typeof n === "number" && Number.isFinite(n);
const rowsOf = (obs) => (Array.isArray(obs?.values?.rows) ? obs.values.rows : Array.isArray(obs?.values) ? obs.values : []);
const KMH_TO_MPH = 0.621371, MS_TO_MPH = 2.23694;

export function observedWindAt(nws, river, at, now) {
  const t = Date.parse(at);
  const fresh = (ms) => Number.isFinite(ms) && Number.isFinite(t) && now - ms <= 90 * 60000 && ms <= now + 5 * 60000 && ms - t >= -45 * 60000 && ms - t < 75 * 60000;
  const pick = (obs, rows, label) => {
    if (!obs?.ok) return null;
    const row = rows.filter((r) => fresh(Date.parse(r.time)) && has(r.speed)).sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
    return row ? { windMph: row.speed, windGustMph: has(row.gust) ? row.gust : null, windDirectionDeg: has(row.dir) ? row.dir : null, source: label, at: row.time } : null;
  };
  const nwsRows = rowsOf(nws).map((r) => ({ time: r.time, speed: has(r.windSpeedKmh) ? r.windSpeedKmh * KMH_TO_MPH : null,
    gust: has(r.windGustKmh) ? r.windGustKmh * KMH_TO_MPH : null, dir: r.windDirectionDeg }));
  const riverRows = rowsOf(river).map((r) => ({ time: r.time, speed: has(r.windSpeedMs) ? r.windSpeedMs * MS_TO_MPH : null,
    gust: has(r.windGustMs) ? r.windGustMs * MS_TO_MPH : null, dir: r.windDirectionDeg }));
  return pick(nws, nwsRows, `nws:${nws?.station ?? "airport"}`) ?? pick(river, riverRows, "matanzas-riverkeeper");
}
