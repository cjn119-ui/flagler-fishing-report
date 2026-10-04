import {
  TZ, RULES, OBS_MAX_AGE_MS, BUOY_MAX_AGE_MS, msToMph, cToF, mToFt, parseWindMph, classifyAlert, verdict,
  sunEvents, seriesFromHilo, pickWindows, windowReason, localDay, isoDay, addDays, nextHours,
} from "./shared/logic.js?v=catch-20260930b";
import { GRID_FORECAST, weeklyOutlook, renderWeek, nowScore } from "./shared/week.js?v=catch-20260930b";
import { biteOutlook, seasonalTargets, biteConfidence } from "./shared/catch.js?v=catch-20260930b";

const $ = (id) => document.getElementById(id);
const NWS = "https://api.weather.gov";
const GRID = `${NWS}/gridpoints/JAX/89,29`;
const POINT = "29.4738,-81.131";
const CO_OPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const REFRESH_MS = 5 * 60e3;
const SNAPSHOT_KEY = "flagler-fishing-sources-v1";
const SPOT_KEY = "flagler-fishing-spot-v1";
const RING = 2 * Math.PI * 52;

const fmt = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });
const fTime = fmt({ hour: "numeric", minute: "2-digit" });
const fDay = fmt({ weekday: "short" });
const fHour = fmt({ hour: "numeric" });
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
  return {
    updated: new Date(props.updateTime ?? props.generatedAt),
    periods: props.periods.map((q) => ({ start: new Date(q.startTime), end: new Date(q.endTime), windMph: parseWindMph(q.windSpeed), rainPct: q.probabilityOfPrecipitation?.value ?? null })),
  };
}
async function loadWeek() {
  const props = (await getJson(GRID_FORECAST)).properties;
  return { days: weeklyOutlook(props.periods, 7, { today: localDay(new Date()) }), updated: new Date(props.updateTime) };
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

const LEVEL_WORD = ["Go", "Caution", "Skip"];
function renderHours(hourly, now, saved) {
  const ol = $("hours"), sum = $("hours-summary");
  ol.replaceChildren();
  const { slots, worst } = hourly ? nextHours(hourly, now) : { slots: [], worst: null };
  $("hours-status").textContent = !slots.length ? "" : saved ? "Saved forecast" : "NWS hourly";
  if (!slots.length) { sum.textContent = "Hourly forecast unavailable."; return; }
  for (const s of slots) {
    const wind = s.windMph == null ? "no wind data" : `${Math.round(s.windMph)} mph`, rain = s.rainPct == null ? "no rain data" : `${Math.round(s.rainPct)}%`;
    const li = el("li", { "aria-label": `${fHour.format(s.start)}: wind ${wind}, rain ${rain}, ${s.level == null ? "no rating" : LEVEL_WORD[s.level]}` });
    li.append(el("b", {}, fHour.format(s.start)), el("span", { class: "dot", "data-l": s.level ?? "" }), el("span", {}, s.windMph == null ? "–" : `${Math.round(s.windMph)} mph`), el("span", {}, s.rainPct == null ? "–" : `${Math.round(s.rainPct)}%`));
    ol.append(li);
  }
  sum.textContent = worst
    ? `${worst.cause === "rain" ? `Rain ${Math.round(worst.slot.rainPct)}%` : `Wind ${Math.round(worst.slot.windMph)} mph`} around ${fHour.format(worst.slot.start)} (${LEVEL_WORD[worst.slot.level].toLowerCase()}).`
    : slots.some((s) => s.level == null) ? "Some hours have incomplete forecast data." : "No wind or rain concerns in the next 6 hours.";
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

function renderTimes(windows, now, spot) {
  const ol = $("windows"); ol.replaceChildren();
  if (!windows.length) { ol.append(el("li", { class: "empty" }, `No complete daylight/twilight windows with forecast${spot === "inshore" ? " and tide" : ""} coverage in the next 24 hours.`)); return; }
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

let spot = "surf";
try { if (localStorage.getItem(SPOT_KEY) === "inshore") spot = "inshore"; } catch {}
let prediction = { reason: "Checking current forecast and alerts…", now: new Date(), windows: { surf: [], inshore: [] }, buoyReady: false };
function renderPrediction() {
  const label = spot === "surf" ? "surf / pier" : "inshore";
  $("bite-conf").textContent = ""; $("bite-conf").dataset.level = "none"; $("bite-conf-why").textContent = ""; $("bite-label").dataset.confidence = "";
  $("spot-surf").setAttribute("aria-pressed", String(spot === "surf"));
  $("spot-inshore").setAttribute("aria-pressed", String(spot === "inshore"));
  $("times-title").textContent = `Best ${label} times`;
  const windows = prediction.windows[spot];
  if (prediction.reason || (spot === "inshore" && prediction.tideMissing)) {
    const reason = prediction.reason ?? "Smith Creek tide predictions unavailable for the inshore outlook.";
    $("bite-label").textContent = "Prediction unavailable";
    $("bite-label").dataset.level = "none";
    $("bite-time").textContent = "";
    $("bite-why").textContent = reason;
    $("bite-targets").textContent = "";
    $("windows").replaceChildren(el("li", { class: "empty" }, reason));
    return;
  }
  const outlook = biteOutlook(windows);
  if (!outlook) {
    $("bite-label").textContent = "No recommended window";
    $("bite-label").dataset.level = "none";
    $("bite-time").textContent = "";
    $("bite-why").textContent = "No complete, suitable daylight window in the next 24 hours.";
    $("bite-targets").textContent = "";
    renderTimes([], prediction.now, spot);
    return;
  }
  $("bite-label").textContent = `${outlook.label} bite outlook`;
  $("bite-label").dataset.level = outlook.level;
  const conf = prediction.confidence?.[spot];
  if (conf) {
    $("bite-conf").textContent = conf.label; $("bite-conf").dataset.level = conf.level;
    $("bite-conf-why").textContent = `${conf.reasons.length ? conf.reasons.join(" ") : "Forecast, alerts and nearby readings are current and complete."} Confidence reflects data quality, not catch odds.`;
    $("bite-label").dataset.confidence = conf.level;
  }
  const day = localDay(outlook.window.start) === localDay(prediction.now) ? "Today" : "Tomorrow";
  $("bite-time").textContent = `${day} · ${fClock(outlook.window.start)} – ${fClock(outlook.window.end)}`;
  $("bite-why").textContent = `${windowReason(outlook.window)}${spot === "surf" ? prediction.buoyReady ? " · Beach surf may differ from offshore buoy conditions." : " · Beach surf unverified; offshore reading unavailable." : " · Tide timing uses inland Smith Creek."}`;
  const month = Number(fmt({ month: "numeric" }).format(outlook.window.start));
  const targets = seasonalTargets(spot, month);
  $("bite-targets").textContent = targets.length ? `Seasonal targets: ${targets.join(" · ")}` : "No seasonal targets listed for this month.";
  renderTimes(windows, prediction.now, spot);
}
for (const choice of ["surf", "inshore"]) $("spot-" + choice).addEventListener("click", () => {
  spot = choice;
  try { localStorage.setItem(SPOT_KEY, choice); } catch {}
  renderPrediction();
});
renderPrediction();

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
    let [obs, hourlyFeed, alerts, tides, buoy, week] = values;
    // Saved snapshots from before the feed carried its issue time are bare arrays.
    const hourly = Array.isArray(hourlyFeed) ? hourlyFeed : hourlyFeed?.periods ?? null;
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
    if (!alertsKnown) $("v-alerts").append(el("li", { "data-l": "1" }, "Current alerts unverified"));
    const notes = [];
    if (!buoy || !Number.isFinite(buoy.waveM)) notes.push("Marine reading unavailable; score excludes seas.");
    if (!alertsKnown) notes.push("Current alerts unverified.");
    if (cached.length) notes.push(`Saved data: ${cached.join(", ")}.`);
    if (gaps.length && !notes.length) notes.push("Some sources are stale or incomplete.");
    $("coverage").textContent = notes.join(" ");
    renderHours(hourly, now, cached.includes("forecast"));
    renderStats({ obs, buoy, rainPct, windMph: forecastAtNow(hourly, now)?.windMph ?? null, tides, now });
    const hazard = alerts.some(a => classifyAlert(a.event) > 0);
    const reason = hazard ? "Suggestions withheld while a caution or warning alert is active. Review the alert above."
      : !hourly || cached.includes("forecast") || !alertsKnown ? "Prediction unavailable until current forecast and alerts can be checked."
      : v.level === 2 ? "Suggestions withheld during Skip-level conditions." : null;
    const events = reason ? null : sunEvents(now);
    const confidenceFor = (spotName) => biteConfidence({
      spot: spotName, now, forecastUpdated: hourlyFeed?.updated, alertsKnown, tidesOk: !!tides && !cached.includes("tides"),
      buoyAt: Number.isFinite(buoy?.waveM) ? buoy.at : null, obsAt: obs?.at ?? null,
    });
    prediction = {
      confidence: { surf: confidenceFor("surf"), inshore: confidenceFor("inshore") },
      now, reason, buoyReady: Number.isFinite(buoy?.waveM), tideMissing: !tides || cached.includes("tides"),
      windows: {
        surf: events ? pickWindows({ now, hourly, events }, { habitat: "surf" }) : [],
        inshore: events && tides && !cached.includes("tides") ? pickWindows({ now, series: tides.series, hourly, events }, { habitat: "inshore" }) : [],
      },
    };
    renderPrediction();
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
