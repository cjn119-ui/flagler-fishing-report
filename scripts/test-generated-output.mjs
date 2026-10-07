// Post-generation smoke test. Reads the exact files in site/api/ that Pages will serve (plus the
// state.json the next run is seeded from) and fails the deploy if the dates, freshness, required
// fields or catch prediction are wrong. Run after scripts/generate.mjs:
//   node scripts/test-generated-output.mjs [apiDir]
// Env: VALIDATE_NOW (ISO instant, for reproducing a run), MAX_LIVE_AGE_MIN (default 90),
// MAX_REPORT_AGE_MIN (default 240), MAX_EVENING_PREVIEW_AGE_MIN (default 1080).
import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localDay, parseWindMph, seriesFromHilo, sunEvents, pickWindows, nextHours } from "../site/shared/logic.js";
import { biteOutlook } from "../site/shared/catch.js";

const HOURLY_URL = "https://api.weather.gov/gridpoints/JAX/89,29/forecast/hourly";
const MIN = 60e3, HOUR = 3600e3;
const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const calDay = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const longDate = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${iso}T12:00:00Z`));
const localHour = (d) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(d)) % 24;

/** Per-check collector: errors fail the deploy, warnings only print. `stale` drives the "fresh" column. */
function check(label) {
  const c = { label, detail: "", errors: [], warnings: [], stale: false, checkedFreshness: false };
  c.fail = (msg) => void c.errors.push(msg);
  c.warn = (msg) => void c.warnings.push(msg);
  // Valid ISO instant, not in the future, no older than maxAgeMs. Returns the Date (or null).
  c.stamp = (name, value, now, maxAgeMs, { optional = false } = {}) => {
    if (value == null && optional) return null;
    c.checkedFreshness = true;
    const t = typeof value === "string" ? Date.parse(value) : NaN;
    if (!Number.isFinite(t)) { c.fail(`${name} is not a valid timestamp (${JSON.stringify(value)})`); return null; }
    const age = +now - t;
    if (age < -5 * MIN) { c.fail(`${name} is in the future (${value})`); return null; }
    if (age > maxAgeMs) { c.stale = true; c.fail(`${name} is stale: ${Math.round(age / MIN)} min old, limit ${Math.round(maxAgeMs / MIN)} min (${value})`); }
    return new Date(t);
  };
  c.num = (name, value, lo, hi) => { if (!num(value, lo, hi)) c.fail(`${name} missing or out of range [${lo}, ${hi}]: ${JSON.stringify(value)}`); return value; };
  return c;
}

const BAD_TOKEN = /\b(undefined|NaN|null)\b/;

// `spec`: { expectedDate, type, fullDay, stateKey }. `type` is the "Report type:" label the text must carry.
function checkReport(label, report, state, spec, now, limits) {
  const c = check(label);
  const { expectedDate, type, fullDay, stateKey } = spec;
  c.detail = expectedDate;
  if (!report || report instanceof Error) { c.fail(`report file missing or unreadable${report ? `: ${report.message}` : ""}`); return c; }
  if (report.ok !== true) c.fail(`ok is ${JSON.stringify(report.ok)}`);
  if (report.report_date !== expectedDate) c.fail(`report_date is ${JSON.stringify(report.report_date)}, expected ${expectedDate}`);
  c.stamp("generated_at", report.generated_at, now, limits.reportMs);
  const text = report.report_text;
  if (typeof text !== "string" || !text.trim()) c.fail("report_text is empty");
  else {
    if (!text.includes(longDate(expectedDate))) c.fail(`report_text does not mention ${longDate(expectedDate)}`);
    if (!text.includes(`Report type: ${type}`)) c.fail(`report_text is not labelled "${type}"`);
    for (const heading of ["Weather — Palm Coast", "Fishing Conditions — Flagler Beach"]) if (!text.includes(heading)) c.fail(`report_text is missing the "${heading}" section`);
    if (!/(High|Low) near [^\n]*\(-?\d+(\.\d+)? ft\)/.test(text)) c.fail("report_text has no tide high/low line");
    if (!/Official NWS forecast for [^\n]*:/.test(text)) c.fail("report_text has no NWS forecast line");
    // A full-day report must have both temperatures; today's high is legitimately gone late in the day.
    if (fullDay) {
      if (!/high near -?\d+°F/.test(text)) c.fail("report_text has no forecast high");
      if (!/overnight low near -?\d+°F/.test(text)) c.fail("report_text has no overnight low");
    }
    const bad = text.match(BAD_TOKEN);
    if (bad) c.fail(`report_text contains the literal "${bad[1]}"`);
  }
  // state.json seeds the next run; it must hold the same report the page serves.
  const s = state?.[stateKey];
  if (!s) c.fail(`state.json has no ${stateKey}`);
  else {
    if (s.report_date !== report.report_date || s.generated_at !== report.generated_at) c.fail("state.json report differs from the served report");
    if (s.forecast_grid !== "JAX/89,29") c.fail(`state.json forecast_grid is ${JSON.stringify(s.forecast_grid)}`);
  }
  return c;
}

function eveningPreviewRecord(report, state, expectedDate, now) {
  if (!report || report.report_date !== expectedDate || localDay(now) !== expectedDate
    || !String(report.report_text ?? "").includes("Report type: Next-Day Preview")) return null;
  const generated = Date.parse(report.generated_at);
  if (!Number.isFinite(generated) || !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) return null;
  const priorDay = calDay(expectedDate, -1);
  if (localDay(new Date(generated)) !== priorDay || localHour(new Date(generated)) < 17) return null;
  for (const key of ["current-report", "next-day-report"]) {
    const record = state?.[key];
    if (record?.report_date === expectedDate && record.generated_at === report.generated_at
      && new RegExp(`^cloudflare-next-day(?:-recovery)?-${expectedDate}$`).test(record.run_id ?? "")) return key;
  }
  return null;
}

function checkWeather(w, now, limits) {
  const c = check("WEATHER");
  if (!w || w instanceof Error) { c.fail("live/weather.json missing or unreadable"); return c; }
  if (w.ok !== true) c.fail(`ok is ${JSON.stringify(w.ok)}`);
  const at = c.stamp("observed_at", w.observed_at, now, limits.liveMs);
  c.stamp("fetched_at", w.fetched_at, now, limits.liveMs);
  c.detail = at ? `obs ${Math.round((+now - +at) / MIN)}m old` : "";
  const v = w.values ?? {};
  c.num("values.temperature_c", v.temperature_c, -30, 50);
  c.num("values.wind_speed_ms", v.wind_speed_ms, 0, 60);
  const f = w.forecast ?? {};
  c.num("forecast.high_f", f.high_f, -20, 130);
  c.num("forecast.low_f", f.low_f, -20, 130);
  c.num("forecast.precipitation_probability_pct", f.precipitation_probability_pct, 0, 100);
  c.stamp("forecast.fetched_at", f.fetched_at, now, limits.liveMs);
  c.stamp("forecast.updated_at", f.updated_at, now, 12 * HOUR);
  return c;
}

function checkMarine(m, now, limits) {
  const c = check("MARINE");
  if (!m || m instanceof Error) { c.fail("live/marine.json missing or unreadable"); return c; }
  if (m.ok !== true) c.fail(`ok is ${JSON.stringify(m.ok)}`);
  const at = c.stamp("observed_at", m.observed_at, now, limits.liveMs);
  c.stamp("fetched_at", m.fetched_at, now, limits.liveMs);
  c.detail = at ? `obs ${Math.round((+now - +at) / MIN)}m old` : "";
  const v = m.values ?? {};
  c.num("values.wave_height_m", v.wave_height_m, 0, 20);
  c.num("values.dominant_period_s", v.dominant_period_s, 1, 30);
  c.num("values.water_temperature_c", v.water_temperature_c, 0, 40);
  return c;
}

function checkTides(t, now, limits, today) {
  const c = check("TIDES");
  if (!t || t instanceof Error) { c.fail("live/tides.json missing or unreadable"); return c; }
  if (t.ok !== true) c.fail(`ok is ${JSON.stringify(t.ok)}`);
  c.stamp("fetched_at", t.fetched_at, now, limits.liveMs);
  if (t.prediction_date !== today) c.fail(`prediction_date is ${JSON.stringify(t.prediction_date)}, expected ${today}`);
  const events = Array.isArray(t.events) ? t.events : [];
  c.detail = `${events.length} events`;
  if (events.length < 4) c.fail(`only ${events.length} tide events (need at least 4)`);
  let prev = null;
  for (const [i, e] of events.entries()) {
    const time = Date.parse(e?.time);
    if (!Number.isFinite(time) || time < +now - 36 * HOUR || time > +now + 72 * HOUR) { c.fail(`events[${i}].time is invalid or implausible (${JSON.stringify(e?.time)})`); continue; }
    if (!num(e.height_ft, -3, 8)) c.fail(`events[${i}].height_ft is invalid (${JSON.stringify(e.height_ft)})`);
    if (e.type !== "High" && e.type !== "Low") c.fail(`events[${i}].type is ${JSON.stringify(e.type)}`);
    if (prev && (time <= prev.time || e.type === prev.type)) c.fail(`events[${i}] is out of order or does not alternate high/low`);
    prev = { time, type: e.type };
  }
  if (events.length && !events.some((e) => Date.parse(e.time) > +now)) c.fail("no tide event after now");
  return c;
}

/** Runs the page's own catch pipeline (generated tides + NWS hourly) and sanity-checks the result. */
async function checkCatch(tides, now, fetchHourly, limits) {
  const rows = [];
  let hourly;
  try { hourly = await fetchHourly(); } catch (e) { hourly = e; }
  const base = (label) => { const c = check(label); rows.push(c); return c; };
  if (hourly instanceof Error || !hourly) {
    // The browser fetches this feed itself, so an NWS outage during the build must not block a deploy.
    const c = base("CATCH");
    c.warn(`skipped: NWS hourly forecast unreachable (${hourly?.message ?? "no response"})`);
    c.detail = "skipped";
    return rows;
  }
  const hourlyCheck = base("HOURLY");
  const periods = hourly.periods ?? [];
  hourlyCheck.detail = `${periods.length} periods`;
  hourlyCheck.stamp("updateTime", hourly.updatedAt instanceof Date ? hourly.updatedAt.toISOString() : null, now, 6 * HOUR);
  if (periods.length < 24) hourlyCheck.fail(`only ${periods.length} hourly periods (need at least 24)`);
  const finiteWind = periods.filter((p) => Number.isFinite(p.windMph)).length;
  if (periods.length && finiteWind < periods.length * 0.9) hourlyCheck.fail(`wind missing in ${periods.length - finiteWind} of ${periods.length} periods`);
  if (hourlyCheck.errors.length || !(tides && !(tides instanceof Error) && Array.isArray(tides.events))) return rows;

  const hilo = tides.events.map((e) => ({ time: new Date(e.time), h: e.height_ft, type: e.type })).filter((e) => Number.isFinite(+e.time) && Number.isFinite(e.h));
  const series = seriesFromHilo(hilo);
  const events = sunEvents(now);
  const found = {};
  for (const habitat of ["surf", "inshore"]) {
    const c = base(`CATCH ${habitat.toUpperCase()}`);
    const windows = pickWindows({ now, series, hourly: periods, events }, { habitat });
    found[habitat] = windows.length;
    const outlook = biteOutlook(windows);
    if (outlook) {
      const w = outlook.window;
      c.detail = `score=${Math.round(w.score * 100)}`;
      c.checkedFreshness = true; // inputs were checked above
      if (!num(w.score, 0, 1)) c.fail(`score ${w.score} is outside 0-1`);
      if (!(w.start < w.end) || +w.start < +now - HOUR || +w.end > +now + 30 * HOUR) c.fail(`window ${w.start?.toISOString?.()} - ${w.end?.toISOString?.()} is implausible`);
      if (!["Promising", "Mixed", "Slow"].includes(outlook.label)) c.fail(`unexpected label ${outlook.label}`);
    } else c.detail = "no window";
  }
  // Zero windows is legitimate under Skip-level wind/rain; with calm inputs it means a broken pipeline.
  const skipLevel = nextHours(periods, now, 24).slots.some((s) => s.level === 2);
  const [surf, inshore] = rows.slice(-2);
  if (!found.surf && !found.inshore && !skipLevel) { surf.fail("no surf window although no Skip-level wind or rain is forecast"); inshore.fail("no inshore window although no Skip-level wind or rain is forecast"); }
  else if (!found.surf && !found.inshore) { surf.warn("no recommended window (Skip-level conditions forecast)"); inshore.warn("no recommended window (Skip-level conditions forecast)"); }
  else if (found.surf && !found.inshore && !skipLevel) inshore.fail("surf has windows but inshore has none: generated tide data cannot build a series");
  return rows;
}

/** files: { report, nextDay, weather, marine, tides, state } (parsed JSON or an Error). Returns check rows. */
export async function validateGenerated({ files, now = new Date(), fetchHourly, env = {} }) {
  const limits = {
    liveMs: Number(env.MAX_LIVE_AGE_MIN ?? 90) * MIN,
    reportMs: Number(env.MAX_REPORT_AGE_MIN ?? 240) * MIN,
    eveningPreviewMs: Number(env.MAX_EVENING_PREVIEW_AGE_MIN ?? 1080) * MIN,
  };
  const today = localDay(now), tomorrow = calDay(today, 1);
  // Mirror the worker's latestReport(): from 7 PM New York time /api/report serves tomorrow's preview.
  const evening = localHour(now) >= 19;
  const served = evening
    ? { expectedDate: tomorrow, type: "Next-Day Preview", fullDay: true, stateKey: "next-day-report" }
    : { expectedDate: today, type: "Morning Report", fullDay: localHour(now) < 17, stateKey: "current-report" };
  const previewKey = !evening ? eveningPreviewRecord(files.report, files.state, today, now) : null;
  const previewAge = files.report ? +now - Date.parse(files.report.generated_at) : NaN;
  const allowEveningPreviewAge = Boolean(previewKey && previewAge > limits.reportMs && previewAge <= limits.eveningPreviewMs);
  const currentSpec = previewKey ? { ...served, type: "Next-Day Preview", stateKey: previewKey } : served;
  const current = checkReport("CURRENT", files.report, files.state, currentSpec, now,
    allowEveningPreviewAge ? { ...limits, reportMs: limits.eveningPreviewMs } : limits);
  if (allowEveningPreviewAge) {
    current.eveningPreview = true;
    current.warn(`evening preview uses the 18-hour freshness exception: ${Math.round(previewAge / MIN)} min old (limit ${Math.round(limits.eveningPreviewMs / MIN)} min)`);
  }
  if (evening) {
    current.detail += " (preview)";
    // The morning report is not served after 7 PM, but today's must still exist in state.json.
    const m = files.state?.["current-report"];
    if (!m || m.report_date !== today) current.fail(`state.json current-report is ${JSON.stringify(m?.report_date)}, expected ${today}`);
  }
  const rows = [
    current,
    checkReport("NEXT DAY", files.nextDay, files.state, { expectedDate: tomorrow, type: "Next-Day Preview", fullDay: true, stateKey: "next-day-report" }, now, limits),
    checkWeather(files.weather, now, limits),
    checkMarine(files.marine, now, limits),
    checkTides(files.tides, now, limits, today),
    ...(await checkCatch(files.tides, now, fetchHourly, limits)),
  ];
  return rows;
}

export function formatRows(rows) {
  const out = rows.map((r) => {
    const status = r.errors.length ? "FAIL" : "PASS";
    const fresh = r.stale ? "STALE" : r.eveningPreview ? "evening preview" : r.checkedFreshness ? "fresh" : "";
    return `${r.label.padEnd(14)}${r.detail.padEnd(18)}${fresh.padEnd(17)}${status}`.trimEnd();
  });
  for (const r of rows) {
    for (const e of r.errors) out.push(`  ✗ ${r.label}: ${e}`);
    for (const w of r.warnings) out.push(`  ! ${r.label}: ${w}`);
  }
  return out.join("\n");
}

async function fetchNwsHourly() {
  const res = await fetch(HOURLY_URL, { headers: { Accept: "application/geo+json", "User-Agent": "flagler-fishing-report smoke test" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${HOURLY_URL}`);
  const props = (await res.json()).properties;
  return {
    updatedAt: new Date(props.updateTime ?? props.generatedAt),
    periods: props.periods.map((q) => ({ start: new Date(q.startTime), end: new Date(q.endTime), windMph: parseWindMph(q.windSpeed), rainPct: q.probabilityOfPrecipitation?.value ?? null })),
  };
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { return e; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = (process.argv[2] ?? fileURLToPath(new URL("../site/api/", import.meta.url))).replace(/\/?$/, "/");
  const now = process.env.VALIDATE_NOW ? new Date(process.env.VALIDATE_NOW) : new Date();
  const files = {
    report: await readJson(`${dir}report.json`), nextDay: await readJson(`${dir}next-day-report.json`),
    weather: await readJson(`${dir}live/weather.json`), marine: await readJson(`${dir}live/marine.json`),
    tides: await readJson(`${dir}live/tides.json`), state: await readJson(`${dir}state.json`),
  };
  const rows = await validateGenerated({ files, now, fetchHourly: fetchNwsHourly, env: process.env });
  const table = formatRows(rows);
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Generated output check\n\n\`\`\`\n${table}\n\`\`\`\n`).catch(() => {});
  if (rows.some((r) => r.errors.length)) { console.error("\nGenerated output failed validation; not deploying."); process.exit(1); }
}
