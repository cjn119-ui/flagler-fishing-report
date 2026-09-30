import {
  TZ, RULES, OBS_MAX_AGE_MS, BUOY_MAX_AGE_MS, msToMph, cToF, mToFt, parseWindMph, classifyAlert, verdict,
  sunEvents, seriesFromHilo, pickWindows, windowReason, dailyOutlook, localDay, isoDay, addDays,
} from "./logic.js";

const $ = (id) => document.getElementById(id);
const NWS = "https://api.weather.gov";
const GRID = `${NWS}/gridpoints/JAX/89,29`;
const POINT = "29.4738,-81.131";
const CO_OPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const REFRESH_MS = 5 * 60e3;

const fmt = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });
const fTime = fmt({ hour: "numeric", minute: "2-digit" });
const fHour = fmt({ hour: "numeric" });
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

// ---- Loaders: each returns normalized data or throws -----------------------
async function loadObs() {
  const p = (await getJson(`${NWS}/stations/KFIN/observations/latest`)).properties;
  const speed = (q) => {
    if (!q || q.value == null) return null;
    return q.unitCode === "wmoUnit:km_h-1" ? q.value / 1.609344 : q.unitCode === "wmoUnit:m_s-1" ? msToMph(q.value) : null;
  };
  return {
    at: new Date(p.timestamp), tempF: p.temperature?.value == null ? null : cToF(p.temperature.value),
    windMph: speed(p.windSpeed), gustMph: speed(p.windGust), dir: p.windDirection?.value ?? null, text: p.textDescription || "",
  };
}
async function loadHourly() {
  const props = (await getJson(`${GRID}/forecast/hourly`)).properties;
  return props.periods.map((q) => ({
    start: new Date(q.startTime), end: new Date(q.endTime), windMph: parseWindMph(q.windSpeed),
    rainPct: q.probabilityOfPrecipitation?.value ?? null, tempF: q.temperatureUnit === "F" ? q.temperature : null, short: q.shortForecast,
  }));
}
async function loadAlerts() {
  const data = await getJson(`${NWS}/alerts/active?point=${POINT}`);
  return data.features.map((f) => ({ event: f.properties.event, ends: new Date(f.properties.ends || f.properties.expires), severity: f.properties.severity }))
    .sort((a, b) => classifyAlert(b.event) - classifyAlert(a.event));
}
async function loadTides(now) {
  const ymd = (d) => isoDay(d).replaceAll("-", "");
  const url = `${CO_OPS}?${new URLSearchParams({ begin_date: ymd(addDays(now, -1)), end_date: ymd(addDays(now, 2)), station: "8720833", product: "predictions", datum: "MLLW", time_zone: "gmt", units: "english", format: "json", interval: "hilo" })}`;
  const data = await getJson(url);
  if (!Array.isArray(data.predictions) || data.predictions.length < 4) throw new Error("tide predictions missing");
  const hilo = data.predictions.map((p) => ({ time: new Date(p.t.replace(" ", "T") + ":00Z"), h: Number(p.v), type: p.type })).filter((p) => Number.isFinite(p.h));
  return { hilo, series: seriesFromHilo(hilo), fetchedAt: new Date() };
}
async function loadBuoy() {
  const d = await getJson(`../api/live/marine.json?check=${Date.now()}`);
  if (!d.ok) throw new Error("buoy snapshot not ok");
  return { at: new Date(d.observed_at), waveM: d.values.wave_height_m, periodS: d.values.dominant_period_s, waterC: d.values.water_temperature_c };
}

// ---- Rendering --------------------------------------------------------------
function tile(root, label, value, detail, off) {
  const t = el("div", { class: off ? "tile off" : "tile" });
  t.append(el("div", { class: "l" }, label), el("div", { class: "v" }, value), el("div", { class: "d" }, detail));
  root.append(t);
}

function renderVerdict(v, alerts, ctx) {
  $("verdict").dataset.level = v.level ?? "none";
  $("v-badge").textContent = v.label;
  const bits = [];
  if (ctx.windMph != null) bits.push(`wind ${Math.round(ctx.windMph)} mph`);
  if (ctx.rainPct != null) bits.push(`rain ${Math.round(ctx.rainPct)}%`);
  if (ctx.seasM != null) bits.push(`seas ${mToFt(ctx.seasM).toFixed(1)} ft`);
  $("v-why").textContent = v.level == null ? v.reasons[0]
    : v.level === 0 ? `Conditions look fine: ${bits.join(", ")}.`
    : `${v.reasons.join(" · ")}.`;
  const chips = $("v-alerts"); chips.replaceChildren();
  for (const a of alerts ?? []) {
    const li = el("li", { "data-l": classifyAlert(a.event) }, `${a.event} · until ${fClock(a.ends)}`);
    chips.append(li);
  }
  const t = $("v-rules"); t.replaceChildren();
  for (const r of v.rules) {
    const tr = el("tr");
    const c1 = el("td"); c1.append(el("span", { class: "dot", "data-l": r.level ?? "" }), document.createTextNode(r.label));
    let c2;
    if (r.key === "alert") c2 = el("td", {}, ["info", "caution", "skip"][r.level]);
    else {
      const shown = r.value == null ? "no data" : `${r.key === "seas" ? mToFt(r.value).toFixed(1) + " ft" : Math.round(r.value) + " " + r.unit}`;
      const lim = r.key === "seas" ? `${mToFt(RULES.seas.marginal).toFixed(1)} / ${mToFt(RULES.seas.skip).toFixed(1)} ft` : `${r.marginal} / ${r.skip} ${r.unit}`;
      c2 = el("td", {}, `${shown}  (caution ≥ / skip ≥ ${lim})`);
    }
    tr.append(c1, c2); t.append(tr);
  }
}

function renderChart({ now, tides, windows, events }) {
  const W = 360, H = 250, L = 28, R = 8, T = 24, B = 26;
  const t0 = new Date(Math.floor(now / 3600e3) * 3600e3 - 2 * 3600e3), t1 = new Date(t0.getTime() + 24 * 3600e3);
  const pts = tides.series.filter((p) => p.time >= t0 && p.time <= t1);
  const hs = pts.map((p) => p.h);
  const lo = Math.min(...hs) - 0.2, hi = Math.max(...hs) + 0.25;
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (h) => T + (1 - (h - lo) / (hi - lo)) * (H - T - B);
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}` });
  const defs = s("defs"); const g = s("linearGradient", { id: "fill", x1: 0, y1: 0, x2: 0, y2: 1 });
  g.append(s("stop", { offset: "0", "stop-color": "#4CC9F0", "stop-opacity": ".45" }), s("stop", { offset: "1", "stop-color": "#4CC9F0", "stop-opacity": ".03" }));
  defs.append(g); svg.append(defs);
  svg.append(s("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "#0b2233", rx: 4 }));
  // night bands
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].kind !== "sunset" || events[i + 1].kind !== "sunrise") continue;
    const a = Math.max(+events[i].t, +t0), b = Math.min(+events[i + 1].t, +t1);
    if (b > a) svg.append(s("rect", { x: x(a), y: T, width: x(b) - x(a), height: H - T - B, fill: "rgba(1,8,15,.6)" }));
  }
  // hour grid every 3h local
  for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
    const d = new Date(t); const hr = Number(fmt({ hour: "2-digit", hour12: false }).format(d)) % 24;
    if (hr % 3) continue;
    svg.append(s("line", { x1: x(t), x2: x(t), y1: T, y2: H - B, stroke: "#2C5064", "stroke-width": 1, "stroke-dasharray": "2 4" }));
    svg.append(s("text", { x: x(t), y: H - 8, "text-anchor": "middle", fill: "#A9BFCC", "font-size": 11 }, fHour.format(d).replace(" ", "").toLowerCase().replace("m", "")));
  }
  // windows
  windows.forEach((w, i) => {
    const a = Math.max(+w.start, +t0), b = Math.min(+w.end, +t1); if (b <= a) return;
    svg.append(s("rect", { x: x(a), y: T, width: x(b) - x(a), height: H - T - B, fill: "#FFC857", "fill-opacity": ".16", stroke: "#FFC857", "stroke-opacity": ".7", "stroke-width": 1, rx: 3 }));
    svg.append(s("circle", { cx: (x(a) + x(b)) / 2, cy: T - 9, r: 8, fill: "#FFC857" }));
    svg.append(s("text", { x: (x(a) + x(b)) / 2, y: T - 5, "text-anchor": "middle", fill: "#06131c", "font-size": 11, "font-weight": 800 }, String(i + 1)));
  });
  // tide curve
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.h).toFixed(1)}`).join("");
  svg.append(s("path", { d: `${line}L${x(pts.at(-1).time)},${H - B}L${x(pts[0].time)},${H - B}Z`, fill: "url(#fill)" }));
  svg.append(s("path", { d: line, fill: "none", stroke: "#4CC9F0", "stroke-width": 2.5, "stroke-linejoin": "round" }));
  // high/low labels
  for (const e of tides.hilo.filter((p) => p.time >= t0 && p.time <= t1)) {
    const cx = Math.min(Math.max(x(e.time), L + 30), W - R - 30), cy = y(e.h);
    svg.append(s("circle", { cx: x(e.time), cy, r: 3.5, fill: "#fff" }));
    svg.append(s("text", { x: cx, y: e.type === "H" ? cy - 8 : cy + 16, "text-anchor": "middle", fill: "#F4FAFC", "font-size": 11 }, `${fClock(e.time).replace(" ", "").toLowerCase().replace("m", "")} ${e.h.toFixed(1)}′`));
  }
  // y axis (ft) + now
  svg.append(s("text", { x: 4, y: T + 8, fill: "#A9BFCC", "font-size": 10 }, "ft"));
  const nx = x(now);
  svg.append(s("line", { x1: nx, x2: nx, y1: T, y2: H - B, stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
  svg.append(s("text", { x: nx + 4, y: H - B - 4, fill: "#fff", "font-size": 11, "font-weight": 700 }, "now"));
  $("chart").replaceChildren(svg);
  $("chart").setAttribute("aria-label", `Tide height chart for the next 24 hours. ${tides.hilo.filter((p) => p.time >= now && p.time <= t1).map((e) => `${e.type === "H" ? "High" : "Low"} at ${fClock(e.time)}, ${e.h.toFixed(1)} feet`).join("; ")}.`);
}

function renderWindows(windows, now) {
  const ol = $("windows"); ol.replaceChildren();
  if (!windows.length) { ol.append(el("li", { class: "empty" }, "No daylight windows in the next 24 hours.")); return; }
  const today = localDay(now);
  windows.forEach((w, i) => {
    const li = el("li");
    const day = localDay(w.start) === today ? "" : `${fDay.format(w.start)} `;
    const body = el("div"); body.append(el("b", {}, `${day}${fClock(w.start)} – ${fClock(w.end)}${i === 0 ? "  · best" : ""}`), el("span", {}, windowReason(w) || "daylight window"));
    li.append(el("div", { class: "n" }, String(i + 1)), body); ol.append(li);
  });
}

function renderTiles({ obs, buoy, rainPct }) {
  const root = $("tiles"); root.replaceChildren();
  if (obs) tile(root, "Air (KFIN airport)", `${Math.round(obs.tempF)}°F`, `${obs.windMph == null ? "wind n/a" : `${Math.round(obs.windMph)} mph ${compass(obs.dir)}`}${obs.gustMph ? `, gust ${Math.round(obs.gustMph)}` : ""} · ${age(obs.at)}`);
  else tile(root, "Air (KFIN airport)", "No recent reading", "Airport observation is missing or over 2 h old", true);
  if (buoy) {
    tile(root, "Offshore waves (buoy)", `${mToFt(buoy.waveM).toFixed(1)} ft`, `${buoy.periodS ?? "?"} s period · ${age(buoy.at)}`);
    tile(root, "Water temp (buoy)", `${Math.round(cToF(buoy.waterC))}°F`, age(buoy.at));
  } else {
    tile(root, "Offshore waves (buoy)", "No recent reading", "Buoy snapshot is missing or over 3 h old", true);
    tile(root, "Water temp (buoy)", "No recent reading", "", true);
  }
  tile(root, "Rain chance", rainPct == null ? "n/a" : `${Math.round(rainPct)}%`, "highest, next 12 hours", rainPct == null);
}

function renderDays(days) {
  const root = $("days"); root.replaceChildren();
  if (!days.length) { root.append(el("p", { class: "fine" }, "Forecast unavailable.")); return; }
  for (const d of days) {
    const date = new Date(`${d.day}T12:00:00Z`);
    const c = el("div", { class: "day", "data-l": d.verdict.level ?? "" });
    c.append(el("b", {}, new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date)), el("span", { class: "pill" }, d.verdict.label),
      el("span", {}, Number.isFinite(d.hi) ? `${Math.round(d.hi)}°/${Math.round(d.lo)}°` : ""), el("span", {}, `Wind ${Math.round(d.wind)}`), el("span", {}, `Rain ${Math.round(d.rain)}%`));
    root.append(c);
  }
}

// ---- Orchestration ----------------------------------------------------------
let running = false, lastRun = 0;
async function refresh() {
  if (running) return; running = true; $("refresh").classList.add("spin");
  const now = new Date();
  const names = ["airport obs", "forecast", "alerts", "tides", "buoy"];
  const res = await Promise.allSettled([loadObs(), loadHourly(), loadAlerts(), loadTides(now), loadBuoy()]);
  const [obsR, hourlyR, alertsR, tidesR, buoyR] = res;
  const ok = (r) => r.status === "fulfilled" ? r.value : null;
  let obs = ok(obsR), buoy = ok(buoyR);
  const hourly = ok(hourlyR), alerts = ok(alertsR), tides = ok(tidesR);
  if (obs && now - obs.at > OBS_MAX_AGE_MS) obs = null;      // stale data is dropped, never shown as current
  if (buoy && now - buoy.at > BUOY_MAX_AGE_MS) buoy = null;

  const next12 = (hourly ?? []).filter((p) => p.end > now && p.start < new Date(+now + 12 * 3600e3));
  const fMaxWind = next12.length ? Math.max(...next12.map((p) => p.windMph ?? 0)) : null;
  const rainPct = next12.length ? Math.max(...next12.map((p) => p.rainPct ?? 0)) : null;
  const windMph = [obs?.windMph, fMaxWind].filter((x) => x != null).reduce((m, x) => Math.max(m, x), -1);
  const ctx = { windMph: windMph < 0 ? null : windMph, gustMph: obs?.gustMph ?? null, seasM: buoy?.waveM ?? null, rainPct, alerts: alerts ?? [] };
  renderVerdict(verdict(ctx), alerts, ctx);
  renderTiles({ obs, buoy, rainPct });

  if (tides && hourly) {
    const events = sunEvents(now);
    const windows = pickWindows({ now, series: tides.series, hourly, events });
    renderChart({ now, tides, windows, events }); renderWindows(windows, now);
    $("tide-age").textContent = "interpolated from NOAA highs/lows";
  } else {
    $("chart").replaceChildren(el("p", { class: "fine" }, tides ? "Forecast unavailable, so windows can't be scored." : "Tide predictions unavailable."));
    $("windows").replaceChildren(); $("tide-age").textContent = "";
  }
  renderDays(hourly ? dailyOutlook(hourly) : []);

  const failed = res.map((r, i) => r.status === "rejected" ? names[i] : null).filter(Boolean);
  $("status").textContent = `Updated ${fClock(now)}${failed.length ? ` · unavailable: ${failed.join(", ")}` : ""}${obsR.status === "fulfilled" && !obs ? " · airport obs stale, ignored" : ""}${buoyR.status === "fulfilled" && !buoy ? " · buoy stale, ignored" : ""}`;
  running = false; lastRun = Date.now(); $("refresh").classList.remove("spin");
}

$("refresh").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastRun > 2 * 60e3) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
refresh();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
