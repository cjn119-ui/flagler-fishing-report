import {
  TZ, RULES, OBS_MAX_AGE_MS, BUOY_MAX_AGE_MS, msToMph, cToF, mToFt, parseWindMph, classifyAlert, verdict,
  sunEvents, seriesFromHilo, pickWindows, windowReason, localDay, isoDay, addDays,
} from "./v2/logic.js";
import { GRID_FORECAST, weeklyOutlook, renderWeek, nowScore } from "./shared/week.js";

const $ = (id) => document.getElementById(id);
const NWS = "https://api.weather.gov";
const GRID = `${NWS}/gridpoints/JAX/87,28`;
const POINT = "29.4738,-81.131";
const CO_OPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const REFRESH_MS = 5 * 60e3;
const RING = 2 * Math.PI * 52;

const fmt = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });
const fTime = fmt({ hour: "numeric", minute: "2-digit" });
const fDay = fmt({ weekday: "short" });
const fClock = (d) => fTime.format(d).replace(/\s/g, " ");
const el = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const age = (d) => { const m = Math.round((Date.now() - d) / 60e3); return m < 1 ? "just now" : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const compass = (deg) => deg == null ? "" : ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(deg / 22.5) % 16];

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/geo+json, application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ---- Loaders -----------------------------------------------------------------
async function loadObs() {
  const p = (await getJson(`${NWS}/stations/KFIN/observations/latest`)).properties;
  const speed = (q) => !q || q.value == null ? null : q.unitCode === "wmoUnit:km_h-1" ? q.value / 1.609344 : q.unitCode === "wmoUnit:m_s-1" ? msToMph(q.value) : null;
  return { at: new Date(p.timestamp), tempF: p.temperature?.value == null ? null : cToF(p.temperature.value), windMph: speed(p.windSpeed), gustMph: speed(p.windGust), dir: p.windDirection?.value ?? null };
}
async function loadHourly() {
  const props = (await getJson(`${GRID}/forecast/hourly`)).properties;
  return props.periods.map((q) => ({ start: new Date(q.startTime), end: new Date(q.endTime), windMph: parseWindMph(q.windSpeed), rainPct: q.probabilityOfPrecipitation?.value ?? null }));
}
async function loadWeek() {
  const props = (await getJson(GRID_FORECAST)).properties;
  return { days: weeklyOutlook(props.periods, 7), updated: new Date(props.updateTime) };
}
async function loadAlerts() {
  const data = await getJson(`${NWS}/alerts/active?point=${POINT}`);
  return data.features.map((f) => ({ event: f.properties.event, ends: new Date(f.properties.ends || f.properties.expires) })).sort((a, b) => classifyAlert(b.event) - classifyAlert(a.event));
}
async function loadTides(now) {
  const ymd = (d) => isoDay(d).replaceAll("-", "");
  const url = `${CO_OPS}?${new URLSearchParams({ begin_date: ymd(addDays(now, -1)), end_date: ymd(addDays(now, 2)), station: "8720833", product: "predictions", datum: "MLLW", time_zone: "gmt", units: "english", format: "json", interval: "hilo" })}`;
  const data = await getJson(url);
  if (!Array.isArray(data.predictions) || data.predictions.length < 4) throw new Error("tide predictions missing");
  const hilo = data.predictions.map((p) => ({ time: new Date(p.t.replace(" ", "T") + ":00Z"), h: Number(p.v), type: p.type })).filter((p) => Number.isFinite(p.h));
  return { hilo, series: seriesFromHilo(hilo) };
}
async function loadBuoy() {
  const d = await getJson(`api/live/marine.json?check=${Date.now()}`);
  if (!d.ok) throw new Error("buoy snapshot not ok");
  return { at: new Date(d.observed_at), waveM: d.values.wave_height_m, periodS: d.values.dominant_period_s, waterC: d.values.water_temperature_c };
}

// ---- Rendering ---------------------------------------------------------------
function renderHero(v, alerts, ctx) {
  const hero = $("hero");
  hero.dataset.level = v.level ?? "none";
  $("v-badge").textContent = v.label;
  const score = v.level == null ? null : nowScore(ctx, v.level);
  $("score").textContent = score == null ? "–" : String(score);
  $("ring-fill").style.strokeDashoffset = String(RING * (1 - (score ?? 0) / 100));
  const bits = [];
  if (ctx.windMph != null) bits.push(`wind up to ${Math.round(ctx.windMph)} mph`);
  if (ctx.rainPct != null) bits.push(`rain ${Math.round(ctx.rainPct)}%`);
  if (ctx.seasM != null) bits.push(`seas ${mToFt(ctx.seasM).toFixed(1)} ft`);
  $("v-why").textContent = v.level == null ? v.reasons[0] : v.level === 0 ? `Conditions look good: ${bits.join(", ")}.` : `${v.reasons.join(" · ")}.`;
  const chips = $("v-alerts"); chips.replaceChildren();
  for (const a of alerts ?? []) chips.append(el("li", { "data-l": classifyAlert(a.event) }, `${a.event} · until ${fClock(a.ends)}`));
  const t = $("v-rules"); t.replaceChildren();
  for (const r of v.rules) {
    const tr = el("tr"), c1 = el("td");
    c1.append(el("span", { class: "dot", "data-l": r.level ?? "" }), document.createTextNode(r.label));
    let text;
    if (r.key === "alert") text = ["info", "caution", "skip"][r.level];
    else {
      const shown = r.value == null ? "no data" : r.key === "seas" ? `${mToFt(r.value).toFixed(1)} ft` : `${Math.round(r.value)} ${r.unit}`;
      const lim = r.key === "seas" ? `${mToFt(RULES.seas.marginal).toFixed(1)} / ${mToFt(RULES.seas.skip).toFixed(1)} ft` : `${r.marginal} / ${r.skip} ${r.unit}`;
      text = `${shown} · caution / skip at ${lim}`;
    }
    tr.append(c1, el("td", {}, text)); t.append(tr);
  }
}

function stat(root, label, value, unit, detail, { off = false, wide = false, compact = false } = {}) {
  const s = el("div", { class: `stat${off ? " off" : ""}${wide ? " wide" : ""}${compact ? " compact" : ""}` });
  const main = el("div"); main.append(el("div", { class: "k" }, label));
  const v = el("div", { class: "v" }, value); if (unit) v.append(el("small", {}, unit));
  main.append(v);
  s.append(main, el("div", { class: "d" }, detail));
  root.append(s);
}

function renderStats({ obs, buoy, rainPct, windMph, tides, now }) {
  const root = $("stats"); root.replaceChildren();
  const wind = obs?.windMph ?? windMph;
  if (wind != null) stat(root, "Wind now", String(Math.round(wind)), "mph", obs?.windMph != null ? `${compass(obs.dir)}${obs.gustMph ? ` · gust ${Math.round(obs.gustMph)}` : ""} · ${age(obs.at)}` : "forecast");
  else stat(root, "Wind now", "No data", "", "", { off: true });
  stat(root, "Rain chance", rainPct == null ? "No data" : String(Math.round(rainPct)), rainPct == null ? "" : "%", "highest, next 12 h", { off: rainPct == null });
  if (buoy) {
    stat(root, "Offshore seas", mToFt(buoy.waveM).toFixed(1), "ft", `${buoy.periodS ?? "?"} s period · ${age(buoy.at)}`);
    stat(root, "Water", String(Math.round(cToF(buoy.waterC))), "°F", age(buoy.at));
  } else {
    stat(root, "Offshore seas", "No recent reading", "", "buoy over 3 h old", { off: true });
    stat(root, "Water", "No recent reading", "", "", { off: true });
  }
  if (obs) stat(root, "Air", String(Math.round(obs.tempF)), "°F", "KFIN airport");
  const next = tides?.hilo.find((e) => e.time > now);
  if (next) stat(root, "Next tide", `${next.type === "H" ? "High" : "Low"} ${fClock(next.time)}`, "", `${next.h.toFixed(1)} ft · ${fDay.format(next.time)}`, { compact: true });
  if (root.children.length % 2) root.lastElementChild.classList.add("wide");
}

function renderTimes(windows, now) {
  const ol = $("windows"); ol.replaceChildren();
  if (!windows.length) { ol.append(el("li", { class: "empty" }, "No daylight windows in the next 24 hours.")); return; }
  const today = localDay(now);
  windows.forEach((w, i) => {
    const li = el("li"), body = el("div");
    const day = localDay(w.start) === today ? "" : `${fDay.format(w.start)} `;
    body.append(el("b", {}, `${day}${fClock(w.start)} – ${fClock(w.end)}`), el("small", {}, windowReason(w) || "daylight window"));
    li.append(el("div", { class: "n" }, String(i + 1)), body);
    if (i === 0) li.append(el("span", { class: "badge" }, "Best"));
    ol.append(li);
  });
}

// ---- Orchestration -----------------------------------------------------------
let running = false, lastRun = 0;
async function refresh() {
  if (running) return; running = true; $("refresh").classList.add("spin");
  const now = new Date();
  const names = ["airport obs", "forecast", "alerts", "tides", "buoy", "7-day"];
  const res = await Promise.allSettled([loadObs(), loadHourly(), loadAlerts(), loadTides(now), loadBuoy(), loadWeek()]);
  const [obsR, hourlyR, alertsR, tidesR, buoyR, weekR] = res;
  const ok = (r) => r.status === "fulfilled" ? r.value : null;
  let obs = ok(obsR), buoy = ok(buoyR);
  const hourly = ok(hourlyR), alerts = ok(alertsR), tides = ok(tidesR), week = ok(weekR);
  if (obs && now - obs.at > OBS_MAX_AGE_MS) obs = null;      // stale readings are dropped, never shown as current
  if (buoy && now - buoy.at > BUOY_MAX_AGE_MS) buoy = null;

  const next12 = (hourly ?? []).filter((p) => p.end > now && p.start < new Date(+now + 12 * 3600e3));
  const fMaxWind = next12.length ? Math.max(...next12.map((p) => p.windMph ?? 0)) : null;
  const rainPct = next12.length ? Math.max(...next12.map((p) => p.rainPct ?? 0)) : null;
  const windMph = [obs?.windMph, fMaxWind].filter((x) => x != null).reduce((m, x) => Math.max(m, x), -1);
  const ctx = { windMph: windMph < 0 ? null : windMph, gustMph: obs?.gustMph ?? null, seasM: buoy?.waveM ?? null, rainPct, alerts: alerts ?? [] };
  renderHero(verdict(ctx), alerts, ctx);
  renderStats({ obs, buoy, rainPct, windMph: ctx.windMph, tides, now });

  if (tides && hourly) renderTimes(pickWindows({ now, series: tides.series, hourly, events: sunEvents(now) }), now);
  else $("windows").replaceChildren(el("li", { class: "empty" }, "Times unavailable until tide and forecast data load."));

  if (week) {
    renderWeek($("week-chart"), week.days, { today: localDay(now) });
    $("week-status").textContent = `NWS · updated ${fDay.format(week.updated)} ${fClock(week.updated)}`;
  } else if (!$("week-chart").childElementCount) $("week-status").textContent = "Forecast unavailable";

  const failed = res.map((r, i) => r.status === "rejected" ? names[i] : null).filter(Boolean);
  $("updated").replaceChildren(el("span", { class: "lbl" }, "Updated "), document.createTextNode(fClock(now)));
  $("status").textContent = failed.length ? `Unavailable: ${failed.join(", ")}` : "All sources OK";
  running = false; lastRun = Date.now(); $("refresh").classList.remove("spin");
}

$("refresh").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastRun > 2 * 60e3) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
refresh();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
