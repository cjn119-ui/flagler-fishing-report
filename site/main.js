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
const SNAPSHOT_KEY = "flagler-fishing-sources-v1";
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
  document.querySelector(".ring").setAttribute("aria-label", score == null ? "Conditions score unavailable" : `Conditions score ${score} out of 100`);
  $("score").textContent = score == null ? "–" : String(score);
  $("ring-fill").style.strokeDashoffset = String(RING * (1 - (score ?? 0) / 100));
  const bits = [];
  if (ctx.windMph != null) bits.push(`wind up to ${Math.round(ctx.windMph)} mph`);
  if (ctx.rainPct != null) bits.push(`rain ${Math.round(ctx.rainPct)}%`);
  if (ctx.seasM != null) bits.push(`seas ${mToFt(ctx.seasM).toFixed(1)} ft`);
  $("v-why").textContent = v.level == null ? v.reasons[0] : v.level === 0 ? `Available readings look favorable: ${bits.join(", ")}.` : `${v.reasons.join(" · ")}.`;
  const chips = $("v-alerts"); chips.replaceChildren();
  for (const a of alerts ?? []) chips.append(el("li", { "data-l": classifyAlert(a.event) }, `${a.event}${Number.isFinite(+a.ends) ? ` · until ${fClock(a.ends)}` : ""}`));
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
  if (wind != null) stat(root, "Wind now", String(Math.round(wind)), "mph", obs?.windMph != null ? `${wind === 0 ? "Calm" : compass(obs.dir)}${obs.gustMph ? ` · gust ${Math.round(obs.gustMph)}` : ""} · ${age(obs.at)}` : "forecast");
  else stat(root, "Wind now", "No data", "", "", { off: true });
  stat(root, "Rain chance", rainPct == null ? "No data" : String(Math.round(rainPct)), rainPct == null ? "" : "%", "highest, next 12 h", { off: rainPct == null });
  if (buoy && Number.isFinite(buoy.waveM)) {
    stat(root, "Offshore seas", mToFt(buoy.waveM).toFixed(1), "ft", `${buoy.periodS ?? "?"} s period · ${age(buoy.at)}`);
  } else {
    stat(root, "Offshore seas", "No recent reading", "", "missing or over 3 h old", { off: true });
  }
  stat(root, "Water", Number.isFinite(buoy?.waterC) ? String(Math.round(cToF(buoy.waterC))) : "No recent reading", Number.isFinite(buoy?.waterC) ? "°F" : "", buoy ? `Offshore · ${age(buoy.at)}` : "Offshore buoy unavailable", { off: !Number.isFinite(buoy?.waterC) });
  stat(root, "Air", Number.isFinite(obs?.tempF) ? String(Math.round(obs.tempF)) : "No data", Number.isFinite(obs?.tempF) ? "°F" : "", "KFIN airport", { off: !Number.isFinite(obs?.tempF) });
  const next = tides?.hilo.find((e) => e.time > now);
  if (next) stat(root, "Next tide", `${next.type === "H" ? "High" : "Low"} ${fClock(next.time)}`, "", `${next.h.toFixed(1)} ft · Smith Creek (inland)`, { compact: true });
  else stat(root, "Next tide", "No data", "", "Smith Creek (inland)", { off: true });
  if (root.children.length % 2) root.lastElementChild.classList.add("wide");
}

function renderTimes(windows, now) {
  const ol = $("windows"); ol.replaceChildren();
  if (!windows.length) { ol.append(el("li", { class: "empty" }, "No complete daylight/twilight windows with forecast and tide coverage in the next 24 hours.")); return; }
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
let snapshots = {};
try { snapshots = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}") || {}; } catch {}
const revive = (key, value) => {
  if (key === "at" || key === "start" || key === "end" || key === "time" || key === "ends" || key === "updated") return new Date(value);
  return value;
};
const finiteMax = (values) => { const known = values.filter(Number.isFinite); return known.length ? Math.max(...known) : null; };
const freshAt = (at, maxAge, now) => Number.isFinite(+at) && +at <= +now + 5 * 60e3 && now - at <= maxAge;
async function refresh() {
  if (running) return;
  running = true;
  $("refresh").classList.add("spin");
  $("refresh").disabled = true;
  try {
    const now = new Date();
    const names = ["airport obs", "forecast", "alerts", "tides", "buoy", "7-day"];
    const res = await Promise.allSettled([loadObs(), loadHourly(), loadAlerts(), loadTides(now), loadBuoy(), loadWeek()]);
    const cached = [];
    const values = res.map((r, i) => {
      const name = names[i];
      if (r.status === "fulfilled") {
        snapshots[name] = { at: +now, value: r.value };
        return r.value;
      }
      const saved = snapshots[name];
      // Last known data remains readable, but expiry is enforced below.
      if (saved && now - saved.at < 24 * 3600e3) {
        cached.push(name);
        return JSON.parse(JSON.stringify(saved.value), revive);
      }
      return null;
    });
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots)); } catch {}
    let [obs, hourly, alerts, tides, buoy, week] = values;
    const gaps = res.flatMap((r, i) => r.status === "rejected" ? [names[i]] : []);
    if (obs && !freshAt(obs.at, OBS_MAX_AGE_MS, now)) { obs = null; gaps.push("stale airport obs"); }
    if (buoy && !freshAt(buoy.at, BUOY_MAX_AGE_MS, now)) { buoy = null; gaps.push("stale buoy"); }
    // A cached alert list cannot establish the absence of current hazards.
    const alertsKnown = alerts != null && !cached.includes("alerts");
    alerts = (alerts ?? []).filter(a => !Number.isFinite(+a.ends) || a.ends > now);
    const next12 = (hourly ?? []).filter(p => p.end > now && p.start < new Date(+now + 12 * 3600e3));
    const fMaxWind = finiteMax(next12.map(p => p.windMph));
    const rainPct = finiteMax(next12.map(p => p.rainPct));
    const windMph = finiteMax([obs?.windMph, fMaxWind]);
    const ctx = { windMph, gustMph: obs?.gustMph ?? null, seasM: buoy?.waveM ?? null, rainPct, alerts };
    const v = verdict(ctx);
    const forecastComplete = next12.length > 0 && next12.every(p => Number.isFinite(p.windMph) && Number.isFinite(p.rainPct)) && next12[0].start <= now && next12.at(-1).end >= +now + 12 * 3600e3 && next12.every((p, i) => !i || p.start <= next12[i - 1].end);
    if (!forecastComplete) gaps.push("incomplete 12-hour forecast");
    if (buoy && !Number.isFinite(buoy.waveM)) gaps.push("missing wave height");
    // Do not turn incomplete core data or an unchecked alert feed into a green Go.
    if (v.level === 0 && (!forecastComplete || !alertsKnown || cached.includes("forecast"))) {
      v.level = null; v.label = "Unconfirmed"; v.reasons = ["Current forecast or alerts could not be fully checked."];
    }
    renderHero(v, alerts, ctx);
    const notes = [];
    if (!buoy || !Number.isFinite(buoy.waveM)) notes.push("Marine reading unavailable; score excludes seas.");
    if (!alertsKnown) notes.push("Current alerts unverified.");
    if (cached.length) notes.push(`Saved data: ${cached.join(", ")}.`);
    if (gaps.length && !notes.length) notes.push("Some sources are stale or incomplete.");
    $("coverage").textContent = notes.join(" ");
    renderStats({ obs, buoy, rainPct, windMph: forecastAtNow(hourly, now)?.windMph ?? null, tides, now });
    if (alerts.some(a => classifyAlert(a.event) > 0)) {
      $("windows").replaceChildren(el("li", { class: "empty" }, "Suggestions withheld while a caution or warning alert is active. Review the alert above."));
    } else if (tides && hourly && alertsKnown && !cached.includes("forecast") && v.level !== 2) {
      renderTimes(pickWindows({ now, series: tides.series, hourly, events: sunEvents(now) }), now);
    } else $("windows").replaceChildren(el("li", { class: "empty" }, "Suggestions unavailable until current forecast, tide and alert data can be checked, with no Skip conditions."));
    if (week) {
      const days = week.days.filter(d => d.day >= localDay(now));
      renderWeek($("week-chart"), days, { today: localDay(now) });
      $("week-status").textContent = days.length ? `${cached.includes("7-day") ? "Saved" : "NWS"} · ${fDay.format(week.updated)} ${fClock(week.updated)}` : "Forecast expired";
    } else $("week-status").textContent = "Forecast unavailable";
    $("updated").replaceChildren(el("span", { class: "lbl" }, "Checked "), document.createTextNode(fClock(now)));
    $("status").textContent = `${navigator.onLine ? "" : "Offline · "}${gaps.length ? `Partial data: ${[...new Set(gaps)].join(", ")}` : "Sources checked"}`;
  } catch (error) {
    console.error("Report refresh failed", error);
    $("status").textContent = "Refresh failed. Try again.";
  } finally {
    running = false; lastRun = Date.now();
    $("refresh").classList.remove("spin"); $("refresh").disabled = false;
  }
}
const forecastAtNow = (hourly, now) => (hourly ?? []).find(p => p.start <= now && p.end > now);

$("refresh").addEventListener("click", refresh);
window.addEventListener("online", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastRun > 2 * 60e3) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
refresh();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
