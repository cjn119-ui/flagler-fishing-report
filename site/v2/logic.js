// Pure scoring logic for the v2 page. No DOM, no network: unit-tested in scripts/test-logic.mjs.
export const LAT = 29.4749754, LON = -81.1270035, TZ = "America/New_York";

// Every threshold the verdict uses. The page renders these so the rules are visible.
export const RULES = {
  wind:  { marginal: 15, skip: 20, unit: "mph", label: "Wind (now or next 12 h)" },
  gust:  { marginal: 25, skip: 30, unit: "mph", label: "Gusts (airport, now)" },
  seas:  { marginal: 1.2, skip: 2.0, unit: "m", label: "Offshore wave height" },
  rain:  { marginal: 30, skip: 60, unit: "%", label: "Rain chance (next 12 h)" },
};
export const OBS_MAX_AGE_MS = 2 * 3600e3;
export const BUOY_MAX_AGE_MS = 3 * 3600e3;

export const msToMph = (ms) => ms * (3600 / 1609.344);
export const cToF = (c) => c * 9 / 5 + 32;
export const mToFt = (m) => m / 0.3048;

/** "5 to 10 mph" -> 10, "12 mph" -> 12, anything else -> null. */
export function parseWindMph(text) {
  const value = String(text ?? "").trim();
  if (/^calm$/i.test(value)) return 0;
  const match = value.match(/^(\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*(\d+(?:\.\d+)?))?\s*mph$/i);
  return match ? Math.max(Number(match[1]), Number(match[2] ?? match[1])) : null;
}

function level(value, rule) {
  if (value == null || !Number.isFinite(value)) return null;
  return value >= rule.skip ? 2 : value >= rule.marginal ? 1 : 0;
}

/** 2 = skip-worthy (warnings/watches), 1 = caution, 0 = informational. */
export function classifyAlert(event = "") {
  if (/warning|watch/i.test(event)) return 2;
  if (/small craft|high surf|rip current|dense fog|wind advisory|heat advisory|gale/i.test(event)) return 1;
  return 0;
}

/**
 * inputs: { windMph, gustMph, seasM, rainPct, alerts: [{event}] }  (null = no fresh data)
 * Returns { level: 0|1|2|null, label, reasons: [...], rules: [...] }
 */
export function verdict({ windMph = null, gustMph = null, seasM = null, rainPct = null, alerts = [] }) {
  const rules = [
    { key: "wind", value: windMph, ...RULES.wind },
    { key: "gust", value: gustMph, ...RULES.gust },
    { key: "seas", value: seasM, ...RULES.seas },
    { key: "rain", value: rainPct, ...RULES.rain },
  ].map((r) => ({ ...r, level: level(r.value, r) }));
  const alertRules = alerts.map((a) => ({ key: "alert", label: a.event, value: null, level: classifyAlert(a.event) }));
  const all = [...rules, ...alertRules];
  const known = all.filter((r) => r.level !== null);
  const core = rules.filter((r) => r.key === "wind" || r.key === "rain");
  if (core.every((r) => r.level === null) && !known.some((r) => r.level > 0)) return { level: null, label: "Unknown", reasons: ["No fresh wind or rain data."], rules: all };
  const top = Math.max(...known.map((r) => r.level));
  const drivers = top === 0 ? [] : known.filter((r) => r.level === top);
  return {
    level: top,
    label: ["Go", "Marginal", "Skip"][top],
    reasons: drivers.map(describeRule),
    rules: all,
  };
}

export function describeRule(r) {
  if (r.key === "alert") return r.label;
  const v = r.key === "seas" ? r.value.toFixed(1) : Math.round(r.value);
  return `${r.label.replace(/ \(.*\)/, "")} ${v} ${r.unit}`;
}

// ---- Sun ------------------------------------------------------------------
const rad = (d) => d * Math.PI / 180;
function solarEvent(iso, sunrise) {
  const [y, m, d] = iso.split("-").map(Number);
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400e3);
  const lngH = LON / 15;
  const t = n + ((sunrise ? 6 : 18) - lngH) / 24;
  const M = 0.9856 * t - 3.289;
  const L = (((M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634) % 360) + 360) % 360;
  let RA = ((Math.atan(0.91764 * Math.tan(rad(L))) * 180 / Math.PI) % 360 + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(rad(L)), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(LAT))) / (cosDec * Math.cos(rad(LAT)));
  if (cosH > 1 || cosH < -1) return null;
  const H = (sunrise ? 360 - Math.acos(cosH) * 180 / Math.PI : Math.acos(cosH) * 180 / Math.PI) / 15;
  const utc = ((((H + RA - 0.06571 * t - 6.622) - lngH) % 24) + 24) % 24;
  const instant = new Date(Date.UTC(y, m - 1, d) + utc * 3600e3);
  // Summer sunset in Florida is on the NEXT UTC date, but the same local date.
  const local = localDay(instant);
  return addDays(instant, local < iso ? 1 : local > iso ? -1 : 0);
}
/** Sunrise/sunset as Dates for a New York calendar date ("YYYY-MM-DD"). */
export const sun = (iso) => ({ sunrise: solarEvent(iso, true), sunset: solarEvent(iso, false) });

export const isoDay = (d) => d.toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);

/** All sun events from day-1 .. day+2 as sorted [{t, kind}] */
export function sunEvents(now) {
  const out = [];
  for (let i = -1; i <= 2; i++) {
    const s = sun(isoDay(addDays(now, i)));
    if (s.sunrise) out.push({ t: s.sunrise, kind: "sunrise" });
    if (s.sunset) out.push({ t: s.sunset, kind: "sunset" });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---- Tides ----------------------------------------------------------------
/** CO-OPS gmt rows [{t:"YYYY-MM-DD HH:MM", v:"1.02"}] -> [{time: Date, h: number}] */
export function parseTideSeries(rows) {
  return rows.map((r) => ({ time: new Date(r.t.replace(" ", "T") + ":00Z"), h: Number(r.v) })).filter((p) => Number.isFinite(p.h));
}
/**
 * Smith Creek is a subordinate station: NOAA only publishes high/low times, no fixed-interval series.
 * Fill in between extremes with a half-cosine (the standard rule-of-twelfths-style approximation).
 * hilo: [{time: Date, h}] sorted. Returns points every `stepMin` minutes between the first and last extreme.
 */
export function seriesFromHilo(hilo, stepMin = 30) {
  const out = [];
  for (let i = 1; i < hilo.length; i++) {
    const a = hilo[i - 1], b = hilo[i], span = b.time - a.time;
    for (let t = a.time.getTime(); t < b.time.getTime(); t += stepMin * 60e3) {
      const f = (t - a.time) / span;
      out.push({ time: new Date(t), h: a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2 });
    }
  }
  if (hilo.length) out.push({ time: hilo.at(-1).time, h: hilo.at(-1).h });
  return out;
}
export function heightAt(series, time) {
  const ms = time.getTime();
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i];
    if (ms >= a.time && ms <= b.time) return a.h + (b.h - a.h) * ((ms - a.time) / (b.time - a.time));
  }
  return null;
}
/** Absolute tide rate in ft/h at `time` (central difference, +/-30 min). */
export function tideRate(series, time) {
  const a = heightAt(series, new Date(time.getTime() - 1800e3)), b = heightAt(series, new Date(time.getTime() + 1800e3));
  return a == null || b == null ? null : Math.abs(b - a);
}

// ---- Windows --------------------------------------------------------------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const windScore = (mph) => (mph == null ? 0.6 : mph <= 10 ? 1 : mph <= 15 ? 0.6 : mph <= 20 ? 0.3 : 0);

export const WEIGHTS = { tide: 0.35, light: 0.25, wind: 0.2, rain: 0.2 };

/** hourly: [{start: Date, end: Date, windMph, rainPct}] */
export function forecastAt(hourly, time) {
  return hourly.find((p) => time >= p.start && time < p.end) ?? null;
}

export function scoreSlot(time, { series, hourly, events, maxRate, habitat = "inshore" }) {
  const rate = habitat === "inshore" ? tideRate(series, time) : null;
  const f = forecastAt(hourly, time);
  const near = events.reduce((best, e) => Math.min(best, Math.abs(e.t - time) / 60e3), Infinity);
  const day = events.some((e, i) => e.kind === "sunrise" && events[i + 1]?.kind === "sunset" && time >= e.t - 45 * 60e3 && time <= events[i + 1].t.getTime() + 45 * 60e3);
  if (!day || !f || !Number.isFinite(f.windMph) || !Number.isFinite(f.rainPct) || (habitat === "inshore" && rate == null)) return null;
  const parts = {
    tide: habitat === "inshore" ? (!maxRate ? 0 : clamp01(rate / maxRate)) : null,
    light: near <= 60 ? 1 : near <= 120 ? 0.75 : 0.5,
    wind: windScore(f?.windMph ?? null),
    rain: f?.rainPct == null ? 0.7 : clamp01(1 - f.rainPct / 100),
  };
  const activeWeights = habitat === "inshore" ? WEIGHTS : { light: .45, wind: .30, rain: .25 };
  const score = Object.entries(activeWeights).reduce((s, [k, w]) => s + parts[k] * w, 0);
  return { time, score, parts, windMph: f?.windMph ?? null, rainPct: f?.rainPct ?? null, nearEvent: near <= 90 ? events.reduce((b, e) => (Math.abs(e.t - time) < Math.abs(b.t - time) ? e : b)).kind : null };
}

/** Best non-overlapping 2-hour windows in the next 24 h. Returns up to `max`, best first. */
export function pickWindows({ now, series = [], hourly, events }, { max = 3, hours = 24, lengthMin = 120, habitat = "inshore" } = {}) {
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isInteger(lengthMin / 30) || lengthMin <= 0) return [];
  const maxRate = series.reduce((m, p) => Math.max(m, tideRate(series, p.time) ?? 0), 0);
  const step = 30 * 60e3, slotsPerWindow = lengthMin / 30;
  const start = Math.ceil(now.getTime() / step) * step;
  const horizon = +now + hours * 3600e3;
  const wins = [];
  for (let t = start; t + lengthMin * 60e3 <= horizon; t += step) {
    const end = t + lengthMin * 60e3;
    const light = events.some((e, i) => e.kind === "sunrise" && events[i + 1]?.kind === "sunset" && t >= +e.t - 45 * 60e3 && end <= +events[i + 1].t + 45 * 60e3);
    if (!light) continue;
    // Check every intersecting forecast interval, including changes between samples.
    const covered = hourly.filter(p => +p.start < end && +p.end > t).sort((a, b) => a.start - b.start);
    let through = t;
    let complete = true;
    for (const p of covered) {
      if (+p.start > through || !Number.isFinite(p.windMph) || p.windMph < 0 || !Number.isFinite(p.rainPct) || p.rainPct < 0 || p.rainPct > 100) { complete = false; break; }
      through = Math.max(through, +p.end);
    }
    if (!complete || through < end) continue;
    const windMph = Math.max(...covered.map(p => p.windMph));
    const rainPct = Math.max(...covered.map(p => p.rainPct));
    if (verdict({ windMph, rainPct }).level === 2) continue;
    const w = Array.from({ length: slotsPerWindow }, (_, i) => scoreSlot(new Date(t + (i + .5) * step), { series, hourly, events, maxRate, habitat }));
    if (w.some(s => s === null) || (habitat === "inshore" && (tideRate(series, new Date(t)) == null || tideRate(series, new Date(end)) == null))) continue;
    const avg = w.reduce((sum, x) => sum + x.score, 0) / w.length;
    const parts = Object.fromEntries(Object.keys(WEIGHTS).map(k => [k, k === "tide" && habitat !== "inshore" ? null : w.reduce((sum, x) => sum + x.parts[k], 0) / w.length]));
    wins.push({ start: new Date(t), end: new Date(end), score: avg, parts, windMph, rainPct, nearEvent: w.find(x => x.nearEvent)?.nearEvent ?? null });
  }
  wins.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const w of wins) {
    if (picked.length >= max) break;
    if (picked.every((p) => Math.abs(p.start - w.start) >= lengthMin * 60e3)) picked.push(w);
  }
  return picked;
}

/** Short reason from the strongest components of a window. */
export function windowReason(w) {
  const bits = [];
  if (Number.isFinite(w.parts.tide) && w.parts.tide >= 0.7) bits.push("moving tide");
  else if (Number.isFinite(w.parts.tide) && w.parts.tide < 0.3) bits.push("slack tide");
  if (w.nearEvent) bits.push(w.nearEvent === "sunrise" ? "sunrise light" : "sunset light");
  if (w.windMph != null) bits.push(w.windMph <= 10 ? `light wind (${Math.round(w.windMph)} mph)` : `wind ${Math.round(w.windMph)} mph`);
  if (w.rainPct >= 30) bits.push(`${Math.round(w.rainPct)}% rain`);
  return bits.join(" · ");
}

// ---- Multi-day ------------------------------------------------------------
/** Local (New York) calendar date of a Date, "YYYY-MM-DD". */
export function localDay(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function localHour(d) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
}

/** Wind + rain verdict per local day from hourly periods, daytime hours only (6 AM-8 PM). */
export function dailyOutlook(hourly, days = 5) {
  const byDay = new Map();
  for (const p of hourly) {
    const h = localHour(p.start);
    if (h < 6 || h >= 20) continue;
    const key = localDay(p.start);
    const d = byDay.get(key) ?? { day: key, wind: null, rain: null, hi: -Infinity, lo: Infinity, n: 0 };
    if (Number.isFinite(p.windMph)) d.wind = Math.max(d.wind ?? 0, p.windMph);
    if (Number.isFinite(p.rainPct)) d.rain = Math.max(d.rain ?? 0, p.rainPct);
    if (p.tempF != null) { d.hi = Math.max(d.hi, p.tempF); d.lo = Math.min(d.lo, p.tempF); }
    d.n++;
    byDay.set(key, d);
  }
  return [...byDay.values()].filter((d) => d.n >= 6).slice(0, days).map((d) => ({
    ...d,
    verdict: verdict({ windMph: d.wind, rainPct: d.rain }),
  }));
}
