// V5 app prototype. Renders ONLY from contract-shaped PredictionRun JSON (samples in this folder). No scoring logic here.
// Numbers and sentences come from the JSON and from ../engine/copy.js (pure formatters); species/spot catalogs
// (../species.js, ../spots.js) supply names, default setup and access notes. Everything else is layout and state.
import { formatWhenLabel, formatWindowStatus, formatHistoricalRate, formatConfidenceParts, formatCopyMessage, formatHeadline, formatVerdictLine, nextWindowLabel, slotIndexAt, nearestSlotIndex, defaultSlotIndex, sourceSummaries, excludeSpot, rankSpeciesRows, bestUpcomingCandidate, presentChildren, windowPhase, scrubWindows, slotInWindow, slotHeld, confidenceDisplay, pickComparison, factorLine, backupTitle } from "../engine/copy.js";
import { SPECIES } from "../species.js";
import { SPOTS, ACTIVE_SPOTS } from "../spots.js";
import { solarEvents } from "../engine/astro.js";
import { factorsAt, fetchProtoRun, fetchRunDetails, readCachedProtoRuns, writeCachedProtoRun } from "./proto-data.js";
import { catchesToCsv, loadCatches, saveCatches, summarizeCatches, validateCatch } from "./catch-log.js";
import { bestSpeciesCandidate, speciesEligibilityLabel, speciesFitBand, speciesTripRate } from "./species-presentation.js";
import { isModeClosed as catalogModeClosed, openModes, openModeRows } from "./closure-presentation.js";
import { fmtWind, hourlyOutlook, inPeriod, observationFor, observationRows, temperatureF, tideDirectionAt } from "./proto-observations.js";

const TZ = "America/New_York";
const RICH = "live-today", TOMORROW = "live-tomorrow";
const RICH_SAMPLE = "sample-rich.json", TOMORROW_SAMPLE = "sample-rich-tomorrow.json";
const STATES = [
  { id: "maybe",   label: "Sample: MAYBE",       file: RICH_SAMPLE,            nowOffsetMin: 5 },
  { id: "go",      label: "Sample: GO",          file: "sample-go.json",      nowOffsetMin: 30 },
  { id: "skip",    label: "Sample: SKIP",        file: "sample-skip.json",    nowOffsetMin: 10 },
  { id: "stale",   label: "Sample: stale",       file: "sample-stale.json",   nowIso: "2026-10-05T12:05:00.000Z" },
  { id: "offline", label: "Sample: offline",     file: "sample-go.json",      nowOffsetMin: 38, offline: true },
  { id: "partial", label: "Sample: partial",     file: "sample-partial.json", nowOffsetMin: 20 },
];
const THEMES = [["auto", "Auto"], ["dark", "Dark"], ["night", "Night"], ["light", "Light"]];
const TAB_ORDER = ["today", "spots", "species", "plan", "log"];
const AGING_MIN = 90, STALE_MIN = 360;
const TIER = { GO: 0, MAYBE: 1, SKIP: 2 };
const LEVEL = { GO: 0, MAYBE: 1, SKIP: 2 };
const VERDICT_SPOKEN = { GO: "Go", MAYBE: "Maybe", SKIP: "Skip" };
const DELTA = { better: "Better tomorrow", similar: "About the same", worse: "Rougher tomorrow" };
const SHORT_REASON = { provisionalGoThreshold: "Looks good — we're holding GO until our thresholds are tested." }; // taste Q5 (engine/copy.js owns the long form)
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const tick = (kind = "select") => navigator.vibrate?.(kind === "select" ? 6 : 12);

/* ---------- state ---------- */
const st = { tab: "today", h: "today", spot: null, mode: null, species: null, t: null, state: "live", day: 0, f: "all", search: "" };
const session = { history: false, factors: false, use: false, conf: false, sources: false, hint: true, near: null, scroll: {} };
const D = {};            // loaded JSON by file
let lastSpoken = "";
let dataSource = "sample", dataOffline = false;
const horizonSource = { today: "sample", tomorrow: "sample" };
const horizonOffline = { today: false, tomorrow: false };
let refreshError = "";
let refreshInProgress = false, coldRenderPending = true;
/* motion bookkeeping: entrances run once per view, value changes only on user input */
const motion = { shown: null, seen: new Set(), counted: new Set(), filled: new Set(), seal: null, seg: null };
let imageCredits = [], sheetAnimation = null, tabDrag = null, renderedImageCount = 0;
const gestureVelocity = (samples) => {
  if (!samples || samples.length < 2) return 0;
  const end = samples.at(-1), start = [...samples].reverse().find((sample) => end.t - sample.t >= 40) ?? samples[0];
  return (end.p - start.p) / Math.max(1, end.t - start.t);
};
// Settle time so the release continues at the finger's speed (motionEase starts at ~2.25× average speed), kept short so it never lingers.
const gestureDuration = (distance, velocity, fallback = 240) => Math.max(160, Math.min(300, Math.round(Math.max(0, distance) / Math.max(.25, Math.abs(velocity)) * 2.25 || fallback)));
const rubberBand = (distance, width) => Math.sign(distance) * (Math.abs(distance) * width * .2) / (Math.abs(distance) + width * .2);  // stiff edges: little give past the first/last tab
const motionEase = "cubic-bezier(.32,.72,0,1)";  // iOS-like: quick start, no overshoot, short tail
const FISH_IMAGE = Object.fromEntries(SPECIES.map((sp) => [sp.id, sp.id]));

/* ---------- tiny DOM helpers ---------- */
const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) { for (const k of kids.flat(2)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); }
const fill = (el, ...kids) => { el.replaceChildren(...presentChildren(kids)); return el; };
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  add(el, kids);
  return el;
}
const PATHS = {
  check: "M5 12.5 10 17.5 19 7", wave: "M3 9c2.2 0 2.2 2 4.5 2S9.8 9 12 9s2.2 2 4.5 2S18.8 9 21 9M3 15c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.2 2 4.5 2 2.3-2 4.5-2",
  x: "M6 6l12 12M18 6 6 18", shield: "M12 3 5 6v5c0 4.6 3 8 7 10 4-2 7-5.4 7-10V6l-7-3ZM12 8v5M12 16.2v.1",
  down: "M12 18 6 9h12z", warn: "M12 4 3 20h18L12 4ZM12 10v5M12 17.5v.1", dash: "M6 12h12", arrow: "m9 6 6 6-6 6",
  off: "M3 3l18 18M8.5 8.5a6 6 0 0 0-1.4 3M16.4 13a6 6 0 0 0-3-3.4M5 12a10 10 0 0 1 3-2.4M19 12a10 10 0 0 0-1.6-2.2M12 18v.1",
  star: "M12 3.5l2.7 5.5 6 .9-4.4 4.2 1 6L12 17.2 6.7 20.1l1-6L3.3 9.9l6-.9L12 3.5Z",
  pier: "M3 8h18M6 8v11M12 8v11M18 8v11M3 19h18", inshore: "M12 4v12M8.5 7.5h7M5 13c0 4 3 7 7 7s7-3 7-7",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z",
};
function icon(name, cls = "") { return s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: cls }, s("path", { d: PATHS[name] })); }
const modeIcon = (m) => icon(m === "pier" ? "pier" : m === "inshore" ? "inshore" : "wave");
const creditFor = (file) => imageCredits.find((x) => x.file === file);
function image(file, cls, alt = "") {
  const eager = renderedImageCount++ < 6;
  const dimensions = file.startsWith("fish/") ? [640, 420] : file.startsWith("spots/") ? [640, 420] : [1280, 720];
  const el = h("img", { class: `photo ${cls ?? ""}`, alt, width: dimensions[0], height: dimensions[1], loading: eager ? "eager" : "lazy", decoding: "async" });
  const credit = creditFor(file);
  if (credit) el.src = `img/${file}`;
  el.addEventListener("error", () => { el.removeAttribute("src"); el.classList.add("photo-placeholder"); el.setAttribute("role", "img"); el.setAttribute("aria-label", alt || "Image unavailable"); }, { once: true });
  return el;
}
function fishImage(id, cls = "") { const slug = FISH_IMAGE[id]; return slug ? image(`fish/${slug}.webp`, cls, spName(id)) : h("div", { class: `photo photo-placeholder ${cls}`, role: "img", "aria-label": spName(id) }); }
function spotImage(id, cls = "", alt = "") { const file = `spots/${id}.jpg`; return creditFor(file) ? image(file, cls, alt) : h("div", { class: `photo photo-placeholder ${cls}`, role: "img", "aria-label": alt || "Fishing spot" }); }
function spotPhoto(id, cls = "", alt = "", showCaption = false) {
  const file = `spots/${id}.jpg`, closure = closureFor(id), photo = spotImage(id, cls, alt || SPOTS.find((x) => x.id === id)?.name || "Fishing spot");
  if (!closure) return photo;
  const figure = h("figure", { class: "spot-photo" }, photo);
  if (showCaption && creditFor(file) && id === "flagler-pier") figure.append(h("figcaption", { class: "photo-caption" }, "Photo: 2016, before Hurricane Ian"));
  if (showCaption && creditFor(file) && id === "staug-pier") figure.append(h("figcaption", { class: "photo-caption" }, "Photo shows the pier before current repairs"));
  return figure;
}
function searchBox(label, value, oninput) { const id = label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""); return h("label", { class: "search-box" }, icon("pin"), h("span", { class: "sr-only" }, label), h("input", { id, type: "search", placeholder: label, value, "data-fk": id, oninput })); }

/* ---------- formatting (display only) ---------- */
const validDate = (d) => d != null && d !== "" && Number.isFinite(+new Date(d));
const fmtTime = (d) => !validDate(d) ? "Time unavailable" : new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d)).replace(":00", "").replace(/\s([AP]M)$/, "\u00a0$1");
const ampm = (t) => t.match(/\s([AP]M)$/)?.[1];
const fmtRange = (a, b) => { if (!validDate(a) || !validDate(b)) return "Time unavailable"; const x = fmtTime(a), y = fmtTime(b); return `${ampm(x) && ampm(x) === ampm(y) ? x.replace(/\s[AP]M$/, "") : x}–${y}`; };
const localParts = (d) => !validDate(d) ? {} : Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(d)).map((p) => [p.type, p.value]));
const localHour = (d) => Number(localParts(d).hour) % 24;
const localMin = (d) => Number(localParts(d).minute);
const dayKey = (d) => !validDate(d) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
const partWord = (d) => { const hr = localHour(d); return hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"; };
const ageText = (min) => min < 60 ? `${min} min ago` : `${Math.round(min / 60)} hr${Math.round(min / 60) === 1 ? "" : "s"} ago`;
const modeLabel = (m, spotId = null) => ({ surf: spotId === "flagler-pier" || spotId === "staug-pier" ? `${SPOTS.find((x) => x.id === spotId)?.area ?? "Beach"} beach (by the pier)` : "Surf", pier: "Pier", inshore: "Inshore" }[m] ?? m);
const closureFor = (spotId, mode = null) => SPOTS.find((x) => x.id === spotId)?.closures?.find((x) => x.status === "closed" && (!mode || x.modes.includes(mode))) ?? null;
const isModeClosed = (spotId, mode) => catalogModeClosed(spotId, mode, SPOTS);
const closureBadgeText = (spotId) => {
  const closure = closureFor(spotId), month = closure?.reopensEst ? wk(`${closure.reopensEst}-01`, { month: "short", year: "numeric" }) : null;
  if (spotId === "staug-pier" && month) return `Closed · repairs to ~end ${month}`;
  if (month) return `Closed · est. reopen ${month}`;
  return "Closed";
};
const modeDisplay = (mode, spotId) => modeLabel(mode, spotId);
const cap = (x) => x ? x[0].toUpperCase() + x.slice(1) : x;
const spName = (id) => SPECIES.find((x) => x.id === id)?.name ?? id;
const spCat = (id) => SPECIES.find((x) => x.id === id);
const wk = (date, o) => !validDate(`${date}T16:00:00Z`) ? "Date unavailable" : new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o }).format(new Date(`${date}T16:00:00Z`));
const msg = formatCopyMessage;

function freshness(run, now) {
  const age = Math.max(0, Math.round((now - Date.parse(run.generatedAt)) / 60000));
  const pastValid = now > Date.parse(run.validTo);
  const level = age > STALE_MIN || pastValid ? "stale" : age >= AGING_MIN ? "aging" : "fresh";
  return { age, level };
}
function relDay(iso, now) { if (!validDate(iso) || !validDate(now)) return "date unavailable"; const k = dayKey(iso), n = dayKey(now); return k === n ? "today" : k === dayKey(now - 86400000) ? "yesterday" : "earlier"; }
const haversine = (a, b) => { const R = 3958.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

/* ---------- data + context ---------- */
async function load(file) {
  if (D[file]) return D[file];
  const res = await fetch(file, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return (D[file] = await res.json());
}
const stateDef = () => STATES.find((x) => x.id === st.state) ?? { id: "live", live: true };
function locOf(run, id) { return run.locations?.find((l) => l.id === id); }
function modesOf(run, id) { return locOf(run, id)?.modes ?? []; }
function coerceMode(run, id, mode) { const modes = openModes(id, modesOf(run, id), SPOTS); return mode && modes.includes(mode) ? mode : mode ? modes[0] ?? null : null; }
function bestModeRec(run, id) {
  const cands = modesOf(run, id).filter((m) => !isModeClosed(id, m)).map((m) => run.scopeViews?.byLocation?.[`${id}:${m}`]?.recommendation).filter(Boolean);
  return cands.sort((a, b) => TIER[a.verdict] - TIER[b.verdict] || b.suitability - a.suitability)[0] ?? null;
}
function ctx() {
  const def = stateDef(), rich = D[RICH], tom = D[TOMORROW];
  const scoped = !!(st.spot || st.species);
  const override = !def.live && !scoped && st.h === "today";
  const base = def.live ? rich : D[def.file];
  const run = st.h === "tomorrow" ? (def.live ? tom : D[TOMORROW_SAMPLE]) : base;
  const now = def.live ? Date.now() : override ? (def.nowIso ? Date.parse(def.nowIso) : Date.parse(base.generatedAt) + (def.nowOffsetMin ?? 0) * 60000)
                       : Date.now();
  const candidates = openModeRows(run.candidates ?? [], SPOTS);
  let rec = run.recommendation, focus = false, focusMissing = false;
  if (st.species) {
    const rawFocus = run.scopeViews?.bySpecies?.[st.species]?.focused;
    const f = rawFocus && !isModeClosed(rawFocus.locationId, rawFocus.mode) ? rawFocus : null;
    if (f) { rec = f; focus = true; } else focusMissing = true;
  } else if (st.spot && run.scopeViews?.byLocation) {
    const modes = openModes(st.spot, modesOf(run, st.spot), SPOTS);
    const m = st.mode && modes.includes(st.mode) ? st.mode : null;
    rec = (m ? run.scopeViews.byLocation[`${st.spot}:${m}`]?.recommendation : bestModeRec(run, st.spot)) ?? run.recommendation;
  } else if (isModeClosed(rec.locationId, rec.mode)) {
    rec = candidates.map((x) => run.scopeViews?.byLocation?.[`${x.locationId}:${x.mode}`]?.recommendation).filter(Boolean).sort((a,b) => TIER[a.verdict]-TIER[b.verdict] || (b.suitability??0)-(a.suitability??0))[0] ?? rec;
  }
  const fr = freshness(run, now);
  const horizon = st.h === "tomorrow" ? "tomorrow" : "today";
  const source = def.live ? horizonSource[horizon] : "sample";
  const sample = !def.live || source === "sample";
  return { def, run, rec, now, fr, focus, focusMissing, override, sample, source,
    offline: !!def.offline || horizonOffline[horizon], stale: fr.level === "stale",
    partial: run.status === "partial" || (run.missingInputs?.length ?? 0) > 0, skip: rec.verdict === "SKIP",
    overall: isModeClosed(run.recommendation.locationId, run.recommendation.mode) ? rec : run.recommendation, isBest: rec.id === run.recommendation.id, spotId: st.spot, candidates };
}

/* ---------- hash ---------- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const rich = D[RICH];
  const spot = p.get("spot"), mode = p.get("mode"), sp = p.get("species");
  st.tab = TAB_ORDER.includes(p.get("tab")) ? p.get("tab") : "today";
  st.h = p.get("h") === "tomorrow" ? "tomorrow" : "today";
  st.spot = spot && locOf(rich, spot) ? spot : null;
  st.mode = st.spot ? coerceMode(rich, st.spot, mode) : null;
  st.species = sp && spCat(sp) ? sp : null;
  st.t = p.get("t") && !Number.isNaN(Date.parse(p.get("t"))) ? p.get("t") : null;
  st.state = STATES.some((x) => x.id === p.get("state")) ? p.get("state") : "live";
  st.day = Math.min(6, Math.max(0, Number(p.get("day")) || 0));
  applyThemePreference(store.get("theme", "auto"), p.get("theme"));
  return p;
}
function writeHash() {
  const p = new URLSearchParams();
  if (st.tab !== "today") p.set("tab", st.tab);
  if (st.spot) p.set("spot", st.spot);
  if (st.mode) p.set("mode", st.mode);
  if (st.species) p.set("species", st.species);
  if (st.h !== "today") p.set("h", st.h);
  if (st.t) p.set("t", st.t);
  if (st.state !== "live") p.set("state", st.state);
  if (st.tab === "plan" && st.day) p.set("day", st.day);
  const th = new URLSearchParams(location.hash.slice(1)).get("theme"); if (["light", "dark", "night"].includes(th)) p.set("theme", th);
  try { history.replaceState(null, "", `#${p}`); } catch { /* sandboxed */ }
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`v5proto.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`v5proto.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
function safeStorage() { try { return localStorage; } catch { return null; } }
function autoTheme(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  try {
    const events = solarEvents(`${p.year}-${p.month}-${p.day}`, 29.4738, -81.131);
    const sunrise = Date.parse(events.sunrise), sunset = Date.parse(events.sunset);
    if (Number.isFinite(sunrise) && Number.isFinite(sunset)) return now < sunrise || now >= sunset ? "night" : "dark";
  } catch { /* keep the no-flash approximation until solar data is available */ }
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  return hour < 7 || hour >= 19 ? "night" : "dark";
}
function applyThemePreference(preference = store.get("theme", "auto"), override = new URLSearchParams(location.hash.slice(1)).get("theme")) {
  const selected = ["auto", "dark", "night", "light"].includes(preference) ? preference : "auto";
  const resolved = ["light", "dark", "night"].includes(override) ? override : selected === "auto" ? autoTheme() : selected;
  const root = document.documentElement;
  root.dataset.theme = resolved === "light" ? "light" : "dark";
  if (resolved === "night") root.dataset.night = "1"; else delete root.dataset.night;
  root.dataset.themePreference = selected;
}
function syncTheme() { applyThemePreference(store.get("theme", "auto")); }
async function refreshLiveData({ onToday } = {}) {
  if (navigator.onLine === false) {
    horizonOffline.today = horizonOffline.tomorrow = true;
    dataOffline = true;
    return { changed: false, offline: true };
  }
  const storage = safeStorage();
  const before = { today: D[RICH]?.id, tomorrow: D[TOMORROW]?.id };
  refreshInProgress = true;
  const results = await Promise.allSettled(["today", "tomorrow"].map(async (horizon) => {
    const { run, fromCache } = await fetchProtoRun(horizon);
    const today = horizon === "today", key = today ? RICH : TOMORROW;
    const previousId = D[key]?.id;
    D[key] = run;
    horizonSource[horizon] = fromCache ? "cached" : "live";
    horizonOffline[horizon] = false;
    writeCachedProtoRun(storage, horizon, run);
    if (today) hydrateFactors(run);
    if (today) {
      dataSource = horizonSource.today;
      dataOffline = false;
      syncNotifications(D[RICH]);
      onToday?.({ changed: previousId !== run.id, fromCache });
    }
    if (today && before.today == null && imageCredits.length) {
      refreshInProgress = false;
      render({ resetScroll: true });
    }
    return run;
  }));
  refreshInProgress = false;
  const todayOk = results[0].status === "fulfilled", tomorrowOk = results[1].status === "fulfilled";
  if (!todayOk) horizonOffline.today = !D[RICH] || navigator.onLine === false;
  if (!tomorrowOk) horizonOffline.tomorrow = !D[TOMORROW] || navigator.onLine === false;
  dataOffline = horizonOffline.today;
  if (!todayOk && !tomorrowOk && !D[RICH]) throw results[0].reason;
  return { changed: before.today !== D[RICH]?.id || before.tomorrow !== D[TOMORROW]?.id, todayOk, tomorrowOk };
}
function syncNotifications(run = ctx().run) {
  const notify = window.FFNotify;
  if (!notify?.sync) return;
  try { notify.sync({ favorites: store.get("favs", []), run }); }
  catch (error) { console.warn("Flagler notification sync failed", error); }
}

/* ---------- render orchestrator ---------- */
function render({ resetScroll = false, navigation = false } = {}) {
  const renderStarted = performance.now();
  const previousDetails = resetScroll ? [] : [...document.querySelectorAll("#view details")].map((el) => el.open);
  const scrollSelector = ".target-species-scroll,.other-spots-scroll,.species-carousel,.species-tabs,.plan-day-chips,.hourly-scroll,.spotlist .list,.sheet-b";
  const previousScroll = resetScroll ? [] : [...document.querySelectorAll(scrollSelector)].map((el) => el.scrollLeft);
  const previousY = resetScroll ? 0 : window.scrollY;
  if (resetScroll) window.scrollTo({ top: session.scroll[st.tab] ?? 0, behavior: "instant" });
  const fk = document.activeElement?.dataset?.fk;
  const contextStarted = performance.now();
  const c = ctx();
  if (coldRenderPending) console.info(`FLAGLER_PERF ctx_ms=${(performance.now() - contextStarted).toFixed(1)}`);
  st.t = st.t && c.run.slots?.length ? st.t : null;
  renderCtl(c); renderHeader(c); renderBanner(c);
  const view = $("view");
  renderedImageCount = 0;
  const nodes = st.tab === "today" ? todayView(c) : st.tab === "spots" ? spotsView(c) : st.tab === "species" ? speciesView(c) : st.tab === "plan" ? planView(c) : logView(c);
  view.replaceChildren(h("h1", { class: "sr-only" }, { today: "Today", spots: "Spots", species: "Species", plan: "Plan", log: "Log" }[st.tab]), ...nodes);
  if (!resetScroll) {
    [...view.querySelectorAll("details")].forEach((el, i) => { if (previousDetails[i] != null) el.open = previousDetails[i]; });
    [...document.querySelectorAll(scrollSelector)].forEach((el, i) => { if (previousScroll[i] != null) el.scrollLeft = previousScroll[i]; });
    window.scrollTo({ top: previousY, behavior: "instant" });
  }
  animateView(view, { navigation });
  view.setAttribute("aria-busy", "false");
  document.querySelectorAll(".tab").forEach((b) => b.dataset.tab === st.tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  syncReview(); writeHash();
  if (resetScroll && (session.scroll[st.tab] ?? 0) === 0) { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }
  if (fk) document.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true });
  if (st.tab === "today") announce(c);
  syncNativeSpots(c);
  if (coldRenderPending) {
    console.info(`FLAGLER_PERF first_content_ms=${performance.now().toFixed(1)} ctx_ms=${(performance.now() - contextStarted).toFixed(1)} render_ms=${(performance.now() - renderStarted).toFixed(1)} source=${c.source} offline=${c.offline}`);
    coldRenderPending = false;
  }
}
function animateView(view, { navigation = false } = {}) {
  const key = `${st.tab}|${st.h}`, seal = view.querySelector(".seal"), sealKey = seal && `${seal.parentElement.closest("#verdict")?.dataset.level}|${seal.dataset.cert}|${seal.dataset.phase}|${seal.textContent}`;
  if (!navigation && seal && motion.seal && sealKey !== motion.seal) seal.classList.add("swap");
  if (navigation && seal) motion.seen.add(`seal:${sealKey}`);
  if (!navigation && seal && !motion.seen.has(`seal:${sealKey}`)) { motion.seen.add(`seal:${sealKey}`); seal.classList.add("intro"); }
  motion.seal = sealKey ?? motion.seal;
  if (key === motion.shown) return;
  const first = motion.shown == null; motion.shown = key;
  if (navigation) motion.seen.add(st.tab);
  if (!navigation && !motion.seen.has(st.tab)) { // light stagger, once per view; the verdict is never held back
    motion.seen.add(st.tab);
    [...view.querySelectorAll(".col-a > :not(#verdict), .col-b > *, .spotlist .list > li, .grid > li, .days > li, .plan-layout > .card")].slice(0, 12)
      .forEach((el, i) => { el.classList.add("stagger"); el.style.setProperty("--i", Math.min(i, 4)); });
  }
  if (!navigation) animateFirstValues(view);  // no number count-ups while a screen slides in
  const selected = `${st.tab}|${st.spot ?? "any"}|${st.mode ?? "all"}|${st.species ?? "all"}`;
  view.querySelectorAll(".bar-m > i").forEach((bar, i) => {
    const key = `${selected}|bar|${i}`;
    if (motion.filled.has(key)) return;
    motion.filled.add(key);
    if (navigation || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    bar.style.transform = "scaleX(0)"; bar.style.transformOrigin = "left center";
    requestAnimationFrame(() => { if (bar.isConnected) { bar.style.transition = "transform var(--dur-4) var(--ease-spring)"; bar.style.transform = "scaleX(1)"; } });
  });
  if (first) return;
  if (navigation) view.classList.remove("v-in");
  else { view.classList.remove("v-in"); void view.offsetWidth; view.classList.add("v-in"); }
}
function animateFirstValues(view) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const scope = `${st.tab}|${st.spot ?? "any"}|${st.mode ?? "all"}|${st.species ?? "all"}`;
  view.querySelectorAll(".stat .v,.t-num,.big b,.stat-big").forEach((el, i) => {
    const value = Number(el.textContent.trim());
    if (!Number.isFinite(value) || !el.textContent.trim()) return;
    const key = `${scope}|${el.className}|${i}`;
    if (motion.counted.has(key)) return;
    motion.counted.add(key);
    const start = performance.now(), duration = 360;
    const frame = (now) => {
      if (!el.isConnected) return;
      const progress = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
function animateTabPreview(preview, tab) {
  if (!preview) return;
  const previousTab = st.tab, previousShown = motion.shown, previousSeal = motion.seal;
  st.tab = tab;
  animateView(preview, { navigation: true });
  st.tab = previousTab; motion.shown = previousShown; motion.seal = previousSeal;
}
function announce(c) {
  const r = c.rec, focus = c.focus ? ` for ${r.targets?.[0]?.name ?? spName(st.species)}` : "";
  const text = `${VERDICT_SPOKEN[r.verdict]}${focus}. ${c.skip ? formatHeadline({recommendation:r}) : `${r.displayName}, ${r.mode}, ${fmtRange(r.window?.start, r.window?.end)}`}.${c.stale ? " Last known report." : ""}`;
  if (text !== lastSpoken) { lastSpoken = text; $("live").textContent = text; }
}
let tabSettleAnimation = null;
let tabTransitionEpoch = 0;
function interruptTabTransitions({ preserveView = false } = {}) {
  tabTransitionEpoch++;
  document.dispatchEvent(new Event("v5:interrupt-tab-gesture"));
  const view = $("view"), tabs = document.querySelector(".tabs");
  const matrix = view && new DOMMatrixReadOnly(getComputedStyle(view).transform), carriedX = Number.isFinite(matrix?.m41) ? matrix.m41 : 0;
  view?.getAnimations?.().forEach((animation) => animation.cancel());
  if (preserveView && carriedX) view.style.transform = `translateX(${carriedX}px)`;
  else view?.style.removeProperty("transform");
  view?.style.removeProperty("will-change");
  document.querySelectorAll(".tab-peek").forEach((preview) => preview.remove());
  tabs?.classList.remove("dragging", "content-drag"); tabs?.style.removeProperty("--tab-i");
  tabSettleAnimation = null;
  return preserveView ? carriedX : 0;
}
function go(tab, opts = {}) {
  if (!TAB_ORDER.includes(tab) || tab === st.tab) return;
  if (sheet) { closeSheet().then(() => go(tab, opts)); return; }
  const carriedX = interruptTabTransitions({ preserveView: true });
  session.scroll[st.tab] = window.scrollY;
  const before = st.tab, oldIndex = TAB_ORDER.indexOf(before), newIndex = TAB_ORDER.indexOf(tab), view = $("view");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  view.getAnimations?.().forEach((animation) => animation.cancel());
  st.tab = tab;
  render({ resetScroll: true, navigation: true });
  if (!opts?.swipe && view.animate) {
    const direction = Math.sign(newIndex - oldIndex) || 1;
    const animation = reduce
      ? view.animate([{ opacity: .72 }, { opacity: 1 }], { duration: 100, easing: "ease-out" })
      // Taps get a short slide in the tab's direction (the outgoing page is already gone, so a full-width entry would leave a blank band).
      : view.animate([{ opacity: .88, transform: `translateX(${carriedX || direction * 18}px)` }, { opacity: 1, transform: "translateX(0)" }], { duration: gestureDuration(Math.abs(carriedX || 18), 0, 340), easing: motionEase });
    tabSettleAnimation = animation;
    animation.finished.finally(() => { if (tabSettleAnimation === animation) { tabSettleAnimation = null; view.style.removeProperty("transform"); } }).catch(() => {});
  }
  const tabs = document.querySelector(".tabs"); tabs?.style.removeProperty("--tab-i");
  document.dispatchEvent(new CustomEvent("v5:tab", { detail: { tab } }));
  if (opts.haptic !== false) { tick("select"); window.Capacitor?.Plugins?.Haptics?.impact?.({ style: "LIGHT" })?.catch?.(() => {}); }
  const selectedButton = document.querySelector(`.tab[data-tab="${tab}"]`);
  selectedButton?.classList.remove("pop"); if (selectedButton) { void selectedButton.offsetWidth; selectedButton.classList.add("pop"); setTimeout(() => selectedButton.classList.remove("pop"), 220); }
}
function scope({ spot = null, mode = null, species = null, persist = false, tab = "today" } = {}) {
  if (sheet) { closeSheet().then(() => scope({ spot, mode, species, persist, tab })); return; }
  closeSheet(); st.spot = spot; st.mode = spot && mode && openModes(spot, modesOf(ctx().run, spot), SPOTS).includes(mode) ? mode : null; st.species = species; st.t = null; st.h = st.h;
  if (persist) store.set("spot", spot ? { spot, mode } : null);
  session.scroll[st.tab] = window.scrollY; st.tab = tab; session.scroll[tab] = 0;
  render({ resetScroll: true });
}

function syncNativeSpots(c = ctx()) {
  const nativeMap = window.FFNativeMap;
  if (!nativeMap) return;
  if (st.tab !== "spots") { nativeMap.hide?.(); return; }
  const rows = spotRows(c.run, st.f, c.now, st.h);
  nativeMap.show?.({ spots: rows.map(({ loc, rec, fav }) => ({ id: loc.id, name: loc.name, lat: loc.lat, lon: loc.lon, verdict: rec.verdict, favorite: fav, closureBadge: closureFor(loc.id) ? closureBadgeText(loc.id) : null })), selectedId: st.spot, mode: st.mode ?? c.rec.mode ?? "all" });
}

/* ---------- header, control row, banner ---------- */
function renderHeader(c) {
  const { run, fr, offline } = c;
  const chip = $("fresh");
  const updatedAt = !validDate(run.generatedAt) ? "Time unavailable" : new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(run.generatedAt));
  const age = ageText(Math.max(0, Math.round((Date.now() - Date.parse(run.generatedAt)) / 60000)));
  let text = updatedAt, tag = "Updated ", sv = "fresh";
  if (offline) { sv = "offline"; tag = "Offline · "; }
  else if (c.stale) { sv = "stale"; tag = "Stale · "; }
  else if (c.source === "cached") { sv = "cached"; tag = refreshInProgress ? "Saved · updating · " : "Cached · "; }
  else if (c.source === "sample") { sv = "sample"; tag = refreshInProgress ? "Sample · loading live data · " : "Sample · not live · "; }
  else if (run.inputs?.sourceStatus?.some((source) => source.provider === "open-meteo" && source.status === "fallback")) {
    sv = "fallback"; tag = "Open-Meteo fallback · ";
  }
  else if (fr.level === "aging") sv = "aging";
  chip.dataset.s = sv; chip.replaceChildren(sv === "stale" ? icon("warn") : sv === "offline" ? icon("off") : "", h("span", { class: "lbl" }, tag), h("span", { class: "fresh-time" }, text));
  chip.setAttribute("aria-label", `${tag}${text} · ${age}`);
  const rb = $("refresh"); rb.disabled = offline;
  rb.setAttribute("aria-label", offline ? "Refresh unavailable while offline" : "Refresh report");
  const name = st.spot ? (locOf(run, st.spot)?.name ?? "Spot") : "Best anywhere";
  $("spot-label").textContent = name;
  $("spot-pill").dataset.scope = st.spot ? "spot" : "best";
  $("spot-pill").setAttribute("aria-label", `Scope: ${name}. Change spot`);
}
function segment(label, items, cur, on, cls = "") {
  const at = items.findIndex(([id]) => id === cur), from = motion.seg?.label === label ? motion.seg.from : null; // controls are rebuilt, so slide from the last pick
  if (motion.seg?.label === label) motion.seg = null;
  const el = h("div", { class: `seg ${cls}${from != null && from !== at ? " slide" : ""}`, role: "group", "aria-label": label, "data-count": items.length }, items.map(([id, text]) =>
    h("button", { type: "button", "aria-pressed": String(cur === id), "data-fk": `${label}-${id}`, onclick: () => { motion.seg = { label, from: at }; press(id); on(id); } }, text)));
  // Reflect the pick immediately; callers that don't re-render (e.g. the catch form) rely on this.
  const press = (id) => { el.style.removeProperty("--seg-index"); [...el.children].forEach((b, i) => b.setAttribute("aria-pressed", String(items[i][0] === id))); };
  el.style.setProperty("--seg-count", items.length);
  if (from != null) el.style.setProperty("--seg-from", `${from * 100}%`);
  let drag = null, dragged = false, suppressClick = false;
  const indexAt = (x) => Math.max(0, Math.min(items.length - 1, Math.floor((x - el.getBoundingClientRect().left) / (el.getBoundingClientRect().width / items.length))));
  el.addEventListener("pointerdown", (event) => { if (event.button != null && event.button !== 0) return; drag = { id: event.pointerId, start: event.clientX }; dragged = false; el.setPointerCapture(event.pointerId); el.classList.add("dragging"); });
  el.addEventListener("pointermove", (event) => { if (!drag || event.pointerId !== drag.id) return; drag.x = event.clientX; dragged ||= Math.abs(event.clientX - drag.start) > 5; el.style.setProperty("--seg-index", `${indexAt(event.clientX) * 100}%`); });
  const finish = (event) => { if (!drag || event && event.pointerId !== drag.id) return; const moved = dragged, index = indexAt(event?.clientX ?? drag.x ?? drag.start); drag = null; el.classList.remove("dragging"); suppressClick = moved; if (moved) { event?.preventDefault(); motion.seg = { label, from: at }; press(items[index][0]); on(items[index][0]); } else el.style.removeProperty("--seg-index"); };
  el.addEventListener("pointerup", finish); el.addEventListener("pointercancel", finish);
  el.addEventListener("click", (event) => { if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true });
  return el;
}
function renderCtl(c) {
  const ctl = $("ctl"), fresh = $("fresh"); ctl.replaceChildren(); $("header-fresh").replaceChildren(fresh);
  ctl.append(...ctlNodes(c));
}
// Controls row for the current st.tab; also used to build swipe previews so they match the real page.
function ctlNodes(c) {
  const ctl = { nodes: [], append(...n) { this.nodes.push(...n); } };
  if (st.tab !== "plan" && st.tab !== "log") ctl.append(segment("Report day", [["today", "Today"], ["tomorrow", "Tomorrow"]], st.h, (v) => { st.h = v; st.t = null; render(); }, "day"));
  if (refreshError) ctl.append(h("p", { class: "notice refresh-status", role: "status" }, refreshError));
  // The targeting chip is the one way to clear a target, so it shows wherever the target changes what you see.
  if (st.species && st.tab !== "log") ctl.append(h("button", { class: "fchip", type: "button", "data-fk": "unfocus", "aria-label": `Targeting ${spName(st.species)}. Remove`, onclick: () => scope({ spot: st.spot, mode: st.mode, tab: st.tab }) },
    "Targeting: ", h("b", {}, spName(st.species)), h("i", {}, s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: PATHS.x })))));
  if (st.tab !== "today") return ctl.nodes;
  const modes = st.spot ? openModes(st.spot, modesOf(c.run, st.spot), SPOTS) : [];
  if (modes.length > 1 && !st.species) {
    const cur = st.mode ?? c.rec.mode;
    ctl.append(segment("Mode", modes.map((m) => [m, modeDisplay(m,st.spot)]), cur, (m) => { st.mode = m; st.t = null; render(); }, "modes"));
  }
  return ctl.nodes;
}
function renderBanner(c) {
  const slot = $("banner-slot"); slot.replaceChildren();
  const notices = [];
  if (c.sample) notices.push(["Sample data — not live.", "Live report data is unavailable; this view uses the included review sample."]);
  else if (c.offline) notices.push([`Offline — showing the report from ${fmtTime(c.run.generatedAt)}.`, c.source === "cached" ? "Showing the last good live report saved on this device." : "Refresh is paused until you're back online."]);
  if (st.tab === "today" && !c.offline && c.stale) { const when = `${relDay(c.run.generatedAt, c.now)} ${partWord(c.run.generatedAt)}`; notices.push([`This report is from ${when === "earlier evening" ? "an earlier evening" : when}. Pull to refresh.`, "Windows that have passed are struck through; the next one is shown."]); }
  if (c.source === "cached") notices.push([`${refreshInProgress ? "Saved report" : "Cached report"} · generated ${fmtTime(c.run.generatedAt)}${refreshInProgress ? " · updating" : ""}.`, "The iOS app supplied a previously cached report."]);
  if (notices.length) slot.append(h("div", { class: "banner banner-compact", role: "status" }, icon(c.offline ? "off" : "warn"), h("div", {},
    h("p", {}, h("b", {}, notices[0][0])), h("details", {}, h("summary", {}, "Details"), notices.map(([,detail]) => h("p", {}, detail))))));
}

/* ---------- TODAY ---------- */
function whenOf(c) { if (!c.skip && (!validDate(c.rec.window?.start) || !validDate(c.rec.window?.end))) return "Time unavailable"; return c.skip ? msg(c.rec.whenLabel) : formatWhenLabel({ recommendation: c.rec }, c.now); }
function todayView(c) {
  const out = [];
  const heroSpot = st.spot ? (locOf(c.run, st.spot)?.id ?? c.rec.locationId) : c.rec.locationId;
  out.push(h("section", { class: "today-hero", "aria-label": "Current fishing location" }, spotImage(heroSpot, "today-hero-photo", `${locOf(c.run, heroSpot)?.name ?? "Fishing spot"} fishing location`),
    h("div", { class: "today-hero-shade" }), h("button", { class: "today-hero-place", type: "button", onclick: (e) => openSpotSheet(e.currentTarget) }, icon("pin"), h("span", {}, locOf(c.run, heroSpot)?.name ?? "Flagler Beach"), h("small", {}, wk(c.run.targetDate, { weekday: "long", month: "short", day: "numeric" }))), conditionsStrip(c)));
  if (c.focusMissing) out.unshift(h("p", { class: "notice", role: "status" }, `${spName(st.species)} has no usable window in this run, so Today shows the overall best. Remove the chip to clear it.`));
  const disclosure = h("details", { class: "why-verdict" }, h("summary", {}, "Why this verdict"),
    h("p", { class: "fine" }, "Suitability describes how well conditions fit each fish. It is not a catch chance."),
    h("p", { class: "local-history" }, (c.rec.targets ?? []).slice(0, 3).map((x) => `${x.name}: ${formatHistoricalRate(x.historicalRate, c.rec.mode)}`).join(" · ")),
    whyCard(c), confCard(c), sourcesCard(c));
  const setup = useCard(c); setup.classList.add("setup-disclosure");
  out.push(verdictCard(c, disclosure), targetSpeciesRow(c), timesCard(c), setup, tvCard(c), spotsTeaser(c));
  return out.filter(Boolean);
}
function verdictCard(c, disclosure = null) {
  const { rec: r, run } = c;
  const todayRun = c.def.live ? D[RICH] : D[c.def.file];
  const safety = r.gates?.length > 0;
  const lvl = LEVEL[r.verdict];
  const qualOn = !!(r.amberQualifier && !c.skip && r.confidenceReasons?.some((x) => x.kind === "live"));
  // Verdict seal: a discrete GO/MAYBE/SKIP mark, no suitability arc (P2-4).
  const cert = c.stale ? "stale" : "firm", phase = windowPhase(r.window, c.now);
  const sealIcon = r.verdict === "GO" ? "check" : r.verdict === "SKIP" ? (safety ? "shield" : "x") : "wave";
  const seal = h("div", { class: "seal", "data-cert": cert, "data-phase": phase, "aria-hidden": "true" },
    s("svg", { class: "seal-edge", viewBox: "0 0 100 100" }, s("rect", { x: 2, y: 2, width: 96, height: 96, rx: 30, pathLength: 100 })),
    icon(sealIcon), h("span", { class: "seal-word" }, VERDICT_SPOKEN[r.verdict]), c.stale ? h("small", {}, "Last known") : !c.skip && phase === "ended" ? h("small", {}, "Ended") : null);
  const reasonRaw = r.reason?.code && SHORT_REASON[r.reason.code] ? SHORT_REASON[r.reason.code] : msg(r.reason?.text ?? r.reason);
  const reason = !c.skip && r.verdict !== "GO" && r.reason?.code !== "provisionalGoThreshold" && reasonRaw ? h("p", { class: "why-line" }, reasonRaw) : null;
  const qual = qualOn ? h("p", { class: "qual" }, icon("warn"), msg(r.amberQualifier)) : null;
  const endedNext = !c.skip && phase === "ended" ? (nextWindowLabel(run, r, c.now)?.replace(/^Next window\s*/, "") ?? "No more windows today") : null;
  const eyebrow = h("p", { class: "eyebrow" }, whenOf(c).split(" · ")[0], c.focus ? h("span", { class: "tag" }, `for ${spName(st.species)}`) : null);
  const notes = [];
  if (c.focus && TIER[c.overall.verdict] < TIER[r.verdict]) notes.push(h("p", { class: "note" }, h("b", {}, "Overall today: "), formatVerdictLine(c.run).replace(/, [^,]*$/, "")));
  else if (st.spot && !c.focus && TIER[c.overall.verdict] < TIER[r.verdict]) notes.push(h("p", { class: "note" }, h("b", {}, "Best overall today: "), `${c.overall.displayName} (${c.overall.verdict})`));
  else if (st.h === "tomorrow") {
    const cmp = r.comparison?.kind;
    if (cmp) notes.push(h("p", { class: "note" }, h("b", {}, "vs today: "), DELTA[cmp].replace(" tomorrow", "")));
    const tw = todayRun?.recommendation?.window;
    if (tw && Date.parse(tw.end) > c.now) notes.push(h("p", { class: "note" }, `Today's window: ${fmtRange(tw.start, tw.end)}`));
  }
  const bet = c.skip ? nextOption(c) : betRow(c);
  return h("section", { class: `card hero${c.stale ? " dim" : ""}`, id: "verdict", "data-level": lvl, "aria-label": `Verdict: ${VERDICT_SPOKEN[r.verdict]}` },
    h("div", { class: "hero-main" }, seal, h("div", { class: "hero-copy" }, eyebrow, h("h2", { class: "headline" }, endedNext ? `Next: ${endedNext}` : formatHeadline({recommendation:r})), endedNext ? h("p", { class: "ended-verdict" }, `Earlier: ${VERDICT_SPOKEN[r.verdict]} · ${formatHeadline({recommendation:r})}`) : null, r.benchmarkLine ? h("p", { class: "bench why-line" }, msg(r.benchmarkLine)) : null, reason, qual)),
    notes, bet, disclosure);
}
function targetSpeciesRow(c) {
  const rows = (c.rec.targets ?? []).slice(0, 6);
  if (!rows.length) return null;
  return h("section", { class: "target-species card", "aria-label": "Targets" }, h("div", { class: "card-h" }, h("h2", {}, "Targets")),
    h("div", { class: "target-species-scroll" }, rows.map((row) => h("button", { class: "target-species-item", type: "button", "aria-label": `${row.name}, ${speciesFitBand(row.suitability)}. Open species`, onclick: (e) => openSpecies(row.speciesId, e.currentTarget) }, fishImage(row.speciesId, "target-species-image"), h("b", {}, row.name), h("span", { class: "fit-word" }, speciesFitBand(row.suitability))))));
}
function windowLine(c) {
  const w = c.rec.window;
  if (!w) return null;
  if (!validDate(w.start) || !validDate(w.end)) return h("p", { class: "win muted" }, "Time unavailable");
  const start = Date.parse(w.start), end = Date.parse(w.end), range = fmtRange(w.start, w.end);
  if (end <= c.now) {
    const next = nextWindowLabel(c.run, c.rec, c.now);
    const match = next?.match(/^(.*\s)(\d{1,2}(?::\d{2})?\s[AP]M)$/);
    return h("p", { class: "win" }, match ? h("span", { class: "next-label" }, match[1].trim()) : h("strong", { class: "next" }, next ?? "No more windows today"), match ? h("span", { class: "nowrap" }, match[2].replace(/\s/, "\u00a0")) : null, " ", h("span", { class: "muted nowrap" }, h("s", {}, range)));
  }
  if (dayKey(w.start) !== dayKey(c.now)) return h("p", { class: "win" }, `${range} · Tomorrow`);
  if (c.now >= start) return h("p", { class: "win" }, h("strong", {}, `Fish now — until ${fmtTime(w.end)}`));
  return h("p", { class: "win" }, h("span", { class: "nowrap" }, range), " · ", formatWindowStatus({ recommendation: c.rec }, c.now, w));
}
function betRow(c) {
  const r = c.rec;
  const label = c.focus ? "Best for this fish" : st.spot ? "Best window here" : "Best bet";
  const headline = formatHeadline({ recommendation: r });
  return h("button", { class: "bet", type: "button", "data-fk": "bet", onclick: (e) => openSpotDetail(r.locationId, r.mode, e.currentTarget) },
    h("div", {}, h("p", { class: "k" }, label), h("div", { class: "nm" }, headline.includes(r.displayName) ? null : h("span",{class:"bet-name"},r.displayName), h("span", { class: "mchip" }, modeIcon(r.mode), modeDisplay(r.mode,r.locationId))), windowLine(c) ?? h("p", { class: "win muted" }, "Time unavailable")), icon("arrow", "go-i"));
}
function nextOption(c) {
  const n = c.rec.nextOption;
  const body = n ? [h("div", { class: "nm" }, n.displayName, h("span", { class: "mchip" }, modeIcon(n.mode), modeDisplay(n.mode,n.locationId)), n.verdict ? h("span", { class: "vchip", "data-v": n.verdict }, VERDICT_SPOKEN[n.verdict]) : null),
      h("p", { class: "win" }, n.label ? msg(n.label) : "", " · ", fmtRange(n.window?.start, n.window?.end))]
    : [h("p", { class: "win" }, "Check back later.")];
  return h("button", { class: "bet", type: "button", onclick: () => { if (n && dayKey(n.window?.start) !== dayKey(c.now)) { st.h = "tomorrow"; st.t = null; render(); } else if (n) scope({ spot: n.locationId, mode: n.mode }); } }, h("div", {}, h("p", { class: "k" }, "Next best option"), body), icon("arrow", "go-i"));
}
function targetsCard(c) {
  const r = c.rec, targets = (r.targets ?? []).slice(0, 2);
  if (!targets.length) return null;
  const list = h("ul", { class: "targets" });
  for (const t of targets) {
    list.append(h("li", {}, h("button", { class: "t-btn", type: "button", "data-fk": `t-${t.speciesId}`, "aria-label": `${t.name}, suitability ${t.suitability}, ${t.band}. Open species`, onclick: (e) => openSpecies(t.speciesId, e.currentTarget) },
      h("span", { class: "t-name" }, t.name, ...(t.tags ?? []).map((g) => h("span", { class: "tag" }, g))),
      h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${t.suitability}%` })), h("span", { class: "t-num" }, t.suitability))));
    if (session.history) list.append(h("li", { class: "t-hist" }, `${t.name}: ${formatHistoricalRate(t.historicalRate, r.mode)}`));
  }
  const toggle = h("button", { class: "toggle", type: "button", "data-fk": "hist", "aria-pressed": String(session.history), onclick: () => { session.history = !session.history; render(); } }, session.history ? "Hide local history" : "Show local history");
  const hint = !store.get("hintSeen", false) ? h("div", { class: "hint-row" }, h("p", { class: "hint" }, "Suitability = how well conditions fit each fish. It is not a catch chance."),
    h("button", { type: "button", "aria-label": "Dismiss hint", "data-fk": "hint-x", onclick: () => { store.set("hintSeen", true); render(); } }, "×")) : null;
  const why = c.skip ? (c.rec.gates?.[0] ? msg(c.rec.gates[0].text ?? c.rec.gates[0]) : msg(r.reason?.text ?? r.reason)) : "";
  return h("section", { class: `card${c.skip ? " quiet" : ""}`, "aria-label": "Targets" },
    h("div", { class: "card-h" }, h("h2", {}, "Targets"), h("span", { class: "sub" }, "Suitability")),
    c.skip ? h("p", { class: "why-q" }, icon("shield"), `On hold: ${why}`) : null,
    h("div", { class: "card-body" }, list, toggle, hint));
}
function useCard(c) {
  const r = c.rec, set = r.setup ?? {};
  const useLine = msg(r.useLine);
  const det = h("details", { class: `card use${c.skip ? " quiet" : ""}`, open: session.use || null });
  det.addEventListener("toggle", () => { session.use = det.open; });
  det.append(h("summary", { "data-fk": "use" }, h("b", {}, "Use"), h("span", {}, useLine)),
    h("div", { class: "det-body" }, h("dl", {},
      set.where && set.where !== useLine ? h("div", {}, h("dt", {}, "Where"), h("dd", {}, set.where)) : null,
      set.bait?.length ? h("div", {}, h("dt", {}, "Bait"), h("dd", {}, h("ul", {}, set.bait.map((b) => h("li", {}, b))))) : null,
      set.lures?.length ? h("div", {}, h("dt", {}, "Lures"), h("dd", {}, h("ul", {}, set.lures.map((b) => h("li", {}, b))))) : null,
      set.rig ? h("div", {}, h("dt", {}, "Rig"), h("dd", {}, set.rig)) : null),
      h("p", { class: "fine" }, "Check current FWC rules before you go.")));
  return det;
}
function confCard(c) {
  const r = c.rec;
  const { word, suffix, scoreNote } = confidenceDisplay(formatConfidenceParts({ recommendation: r }), { stale: c.stale });
  const det = h("details", { class: "how", open: session.conf || null });
  det.addEventListener("toggle", () => { session.conf = det.open; });
  det.append(h("summary", { "data-fk": "conf" }, "Why?"), h("ul", {}, [scoreNote ? h("li", {}, scoreNote) : null, ...(r.confidenceReasons ?? []).map((x) => h("li", {}, msg(x.text))), r.reason?.code === "provisionalGoThreshold" ? h("li",{},SHORT_REASON.provisionalGoThreshold) : null]));
  return h("section", { class: "card conf", "aria-label": "Confidence" },
    h("div", { class: "conf-row" }, h("p", { class: "conf-line" }, "Confidence: ", h("b", {}, word), suffix ? h("span", { class: "muted" }, ` · ${suffix}`) : null),
      c.partial ? h("span", { class: "vchip amber" }, icon("warn"), "Partial data") : null),
    scoreNote || r.confidenceReasons?.length ? det : null);
}
function glanceCard(c) {
  const targets = targetsCard(c), use = useCard(c), conf = confCard(c);
  const card = h("section", { class: `card glance${c.skip ? " quiet" : ""}`, "aria-label": "Targets and setup" });
  if (targets) card.append(...targets.childNodes);
  use.classList.remove("card"); conf.classList.remove("card");
  card.append(use, conf); return card;
}
function backupCard(c) {
  const b = c.rec.backup;
  if (!b?.window || !validDate(b.window.start) || !validDate(b.window.end)) return c.skip ? null : c.rec.nextOption ? nextOption(c) : null;
  const loc = locOf(c.run, b.locationId);
  const outside = b.distanceMi != null && b.distanceMi > 7;
  const title = backupTitle(b, c.rec, loc?.name, fmtRange(b.window.start, b.window.end));
  return h("button", { class: "bet backup", type: "button", "data-fk": "backup",
    onclick: () => scope({ spot: b.locationId, mode: b.mode }) },
    h("div", {}, h("p", { class: "k" }, "Backup"), h("div", { class: "nm" }, title, b.mode ? h("span", { class: "mchip" }, modeIcon(b.mode), modeDisplay(b.mode,b.locationId)) : null, h("span", { class: "vchip", "data-v": b.verdict }, VERDICT_SPOKEN[b.verdict])),
      b.kind !== "later-window" ? h("p", { class: "win" }, fmtRange(b.window.start, b.window.end)) : null, h("p", { class: "fine" }, b.reason), outside && b.area ? h("p", { class: "fine" }, `In ${b.area}`) : null), icon("arrow", "go-i"));
}
function effectMark(effect, safety) {
  const e = effect === "helps" || effect === "hurts" || effect === "neutral" ? effect : "none";
  const el = h("span", { class: "mk", "data-e": e, role: "img", "aria-label": e === "helps" ? "Helps" : e === "hurts" ? "Hurts" : e === "neutral" ? "Neutral" : "Note" }, icon(e === "helps" ? "check" : e === "hurts" ? (safety ? "shield" : "down") : "dash"));
  if (safety && e === "hurts") el.setAttribute("data-safety", "");
  return el;
}
function whyCard(c) {
  const r = c.rec, factors = c.isBest && !st.species ? (c.run._proto?.factors ?? []) : [];
  const safety = (r.gates?.length ?? 0) > 0;
  const helps = factors.filter((f) => f.effect === "helps").slice(0, 3);
  const rows0 = [...factors.filter((f)=>f.effect === "hurts" && f.available !== false && !/unavailable|thin|buoy|stale|missing/i.test(`${f.code ?? ""} ${msg(f.humanLabel)}`)).slice(0,1).map((f)=>({e:"hurts",t:factorLine(f.label,msg(f.humanLabel))})), ...helps.map((f) => ({ e: "helps", t: factorLine(f.label,msg(f.humanLabel)) })), ...(r.why ?? []).filter((w) => !/unavailable|thin|buoy|stale|missing/i.test(w.code ?? "")).map((w) => ({ e: w.effect ?? (/unavailable|thin|buoy/i.test(w.code) ? "hurts" : "none"), t: msg(w) }))];
  const rows = [...rows0.filter((w) => w.e === "helps").slice(0,3), ...rows0.filter((w) => w.e === "hurts").slice(0,1)];
  const list = h("ul", { class: "whys" }, rows.map((w) => h("li", {}, effectMark(w.e, safety && w.e === "hurts"), h("span", {}, w.t))));
  let table = null;
  if (factors.length) {
    const det = h("details", { class: "how", open: session.factors || null });
    det.addEventListener("toggle", () => { session.factors = det.open; });
    det.append(h("summary", { "data-fk": "factors" }, "See all factors"), h("table", { class: "ftable" }, h("caption", { class: "sr-only" }, "All factors with effect, value and weight"),
      h("thead", { class: "sr-only" }, h("tr", {}, h("th", { scope: "col" }, "Factor"), h("th", { scope: "col" }, "Value and weight"))),
      h("tbody", {}, factors.map((f) => h("tr", {}, h("th", { scope: "row" }, h("b", {}, `${f.label}: ${msg(f.humanLabel)}`), h("small", {}, msg(f.detail))),
        h("td", {}, effectMark(f.effect, f.limiting && safety), h("div", {}, /pressure|season/i.test(f.label) || f.value == null || typeof f.value === "string" ? "—" : `${+f.value.toFixed(2)}${f.unit ? " " + f.unit : ""}`), h("small", {}, `weight ${f.weight?.toFixed(2) ?? "—"}`)))))));
    table = det;
  }
  if (!rows.length && !table) return null;
  return h("section", { class: "card", id: "why", "aria-label": "Why" }, h("div", { class: "card-h" }, h("h2", {}, "Why")), list, table);
}

/* ---------- timeline + scrubber ---------- */
function slotSeries(c) {
  const rows = c.run.slots ?? [];
  return (rows.find((x) => x.locationId === c.rec.locationId && x.mode === c.rec.mode) ?? rows[0])?.slots ?? [];
}
function timesCard(c) {
  const pts = slotSeries(c);
  if (pts.length < 2) return null;
  const n = pts.length, r = c.rec, light = c.run._proto?.light;
  const t0 = Date.parse(pts[0].at), step = (Date.parse(pts[n - 1].at) - t0) / (n - 1), span = step * n;
  const wins = scrubWindows(r, c.run.days ?? [], { skip: c.skip });
  const inWin = (at) => wins.some((w) => Date.parse(at) < Date.parse(w.end) && Date.parse(at) + step > Date.parse(w.start));
  const hasSp = pts.some((p) => p.topSpecies?.length);
  let idx = 0;
  if (st.t) idx = Math.max(0, pts.findIndex((p) => p.at === st.t));
  else idx = defaultSlotIndex(pts, c.now, st.h === "today", inWin);
  const nowIdx = slotIndexAt(pts, c.now);

  const strip = h("div", { class: "scrub", role: "slider", tabindex: "0", "aria-orientation": "horizontal", "aria-label": "Time of day", "aria-valuemin": 0, "aria-valuemax": n - 1, "data-fk": "scrub" });
  const bars = pts.map((p, i) => h("span", { class: `sb${p.suitability == null ? " none" : ""}${inWin(p.at) ? " in" : ""}${i === nowIdx && c.now <= Date.parse(pts[n - 1].at) + step ? " now" : ""}`, style: `--h:${p.suitability == null ? 7 : Math.max(10, p.suitability)}%` }));
  strip.append(...bars);
  const axis = h("div", { class: "axis", "aria-hidden": "true" });
  pts.forEach((p, i) => { if (i % Math.ceil(n / 5) === 0) axis.append(h("span", { style: `left:${((i + 0.5) / n) * 100}%` }, `${localHour(p.at) % 12 || 12}${localHour(p.at) < 12 ? "a" : "p"}`)); });
  const heights = pts.map((p) => p.tide?.heightFt).filter(Number.isFinite);
  if (heights.length > 1) { const lo = Math.min(...heights), hi = Math.max(...heights); strip.append(s("svg", { class: "tide-curve", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" }, s("polyline", { points: pts.flatMap((p,i) => Number.isFinite(p.tide?.heightFt) ? [`${(i+.5)/n*100},${90-(p.tide.heightFt-lo)/(hi-lo || 1)*70}`] : []).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke" }))); }
  const day = h("div", { class: "daybar", "aria-hidden": "true" });
  if (light) (light.sunrise ?? []).forEach((rise) => { const set = (light.sunset ?? []).find((z) => Date.parse(z) > Date.parse(rise)); if (set) { const a = Math.max(0, (Date.parse(rise) - t0) / span), b = Math.min(1, (Date.parse(set) - t0) / span); if (b > a) day.append(h("i", { style: `left:${a * 100}%;width:${(b - a) * 100}%` })); } });
  if (light) (light.sunset ?? []).forEach((set) => { if (!(light.sunrise ?? []).some((rise) => Date.parse(set) > Date.parse(rise))) { const b = Math.min(1, (Date.parse(set) - t0) / span); if (b > 0) day.append(h("i", { style: `left:0;width:${b * 100}%` })); } });

  const readout = h("div", { class: "readout" });
  function update(i, { commit = false, user = false } = {}) {
    const moved = idx !== Math.max(0, Math.min(n - 1, i));
    if (moved) tick();
    idx = Math.max(0, Math.min(n - 1, i));
    readout.classList.toggle("tick", user && moved);
    const p = pts[idx];
    bars.forEach((b, k) => b.classList.toggle("on", k === idx));
    strip.dataset.time = fmtTime(p.at); strip.style.setProperty("--sel", (idx + .5) / n);
    const txt = `${fmtTime(p.at)}, ${p.suitability == null ? "no fishing window" : `suitability ${p.suitability}`}`;
    strip.setAttribute("aria-valuenow", idx); strip.setAttribute("aria-valuetext", txt);
    const isNow = idx === nowIdx;
    const lightTxt = lightAt(light, p.at);
    const tide = p.tide?.heightFt != null ? { v: p.tide.direction ? cap(p.tide.direction) : "", d: `${p.tide.heightFt.toFixed(1)} ft` } : null;
    const outsideWindow = !slotInWindow(p.at, wins);
    const detailParts = [p.suitability == null ? "Fit —" : outsideWindow ? `Fit ${p.suitability}` : `${speciesFitBand(p.suitability)} · fit ${p.suitability}`];
    if (tide) detailParts.push(`${tide.v ? `${tide.v} tide` : "Tide"} ${tide.d}`);
    if (lightTxt?.v) detailParts.push(`Light ${lightTxt.v.toLowerCase()}`);
    const speciesDisclosure = speciesAt(p) ? h("details", { class: "hour-species" }, h("summary", {}, "Species at this time"), speciesAt(p)) : null;
    fill(readout,
      h("div", { class: "ro-top" }, h("span", { class: "t" }, fmtTime(p.at)),
        isNow ? null : h("button", { class: "btn-s", type: "button", "data-fk": "now", onclick: () => { st.t = null; update(nowIdx >= 0 ? nowIdx : nearestSlotIndex(pts, c.now), { user: true }); writeHash(); strip.focus({ preventScroll: true }); } }, "Back to now"),
        h("span", { class: "vchip", "data-v": null }, c.skip && slotHeld(p.at, r.window?.gates ?? []) ? "On hold" : hourlyOutlook(p.suitability, !outsideWindow))),
      h("p", { class: "hour-detail-line" }, detailParts.join(" · ")), speciesDisclosure);
    if (commit) { st.t = p.at; writeHash(); }
  }
  function speciesAt(p) {
    const list = p.topSpecies ?? [];
    if (!hasSp) return null;
    if (!list.length) return h("p", { class: "fine" }, "No species ranking at this time: it falls outside a fishing window.");
    return h("ul", { class: "ro-sp", "aria-label": "Species at this time" }, list.map((x) => h("li", {}, h("button", { class: "t-btn", type: "button", onclick: (e) => openSpecies(x.speciesId, e.currentTarget) },
      h("span", { class: "t-name" }, spName(x.speciesId), x.speciesId === st.species ? h("span", { class: "tag" }, "Targeting") : null),
      h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${x.suitability}%` })), h("span", { class: "t-num" }, x.suitability)))));
  }
  const fromX = (e) => { const b = strip.getBoundingClientRect(); return Math.floor(((e.clientX - b.left) / b.width) * n); };
  let down = false;
  strip.addEventListener("pointerdown", (e) => { down = true; strip.setPointerCapture(e.pointerId); update(fromX(e), { user: true }); });
  strip.addEventListener("pointermove", (e) => { if (down) update(fromX(e), { user: true }); });
  const end = () => { if (down) { down = false; st.t = pts[idx].at; writeHash(); } };
  strip.addEventListener("pointerup", end); strip.addEventListener("pointercancel", end);
  strip.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -4, PageUp: 4 }[e.key];
    if (k != null) { e.preventDefault(); update(idx + k, { commit: true, user: true }); }
    else if (e.key === "Home") { e.preventDefault(); update(0, { commit: true, user: true }); } else if (e.key === "End") { e.preventDefault(); update(n - 1, { commit: true, user: true }); }
  });
  update(idx);
  const events = (c.run.slots?.[0]?.tideEvents ?? []).slice(0, 4).map((e) => `${e.type === "high" ? "High" : "Low"} ${fmtTime(e.at)}`).join(" · ");
  return h("section", { class: "card", "aria-label": "Best times" },
    h("div", { class: "card-h" }, h("h2", {}, "Best times"), h("span", { class: "sub" }, "Drag to see any hour")),
    strip, axis, day,
    h("div", { class: "legend", "aria-hidden": "true" }, h("span", {}, h("i", {}), "Window"), h("span", {}, h("i", { class: "d" }), "Daylight"), h("span", {}, h("i", { class: "n" }), "No window"), h("span", {}, h("i", { class: "o" }), "Selected"), heights.length > 1 ? h("span", {}, h("i", { class: "tide" }), "Tide") : null),
    readout, events ? h("p", { class: "fine" }, events) : null);
}
function lightAt(light, at) {
  if (!light) return null;
  const t = Date.parse(at), rises = (light.sunrise ?? []).map(Date.parse), sets = (light.sunset ?? []).map(Date.parse);
  const dayNow = rises.some((rz) => sets.some((z) => z > rz && t >= rz && t < z)) || (sets.length && !rises.some((rz) => rz <= t) && sets.some((z) => t < z) && !rises.some((rz) => rz > t && rz < Math.min(...sets)));
  const nextRise = rises.find((x) => x > t), nextSet = sets.find((x) => x > t);
  return dayNow ? { v: "Daylight", d: nextSet ? `Sunset ${fmtTime(nextSet)}` : "" } : { v: "Night", d: nextRise ? `Sunrise ${fmtTime(nextRise)}` : "" };
}
function conditionsCard(c) {
  const all = c.isBest && !st.species ? (c.run._proto?.factors ?? []) : [];
  const f = ["wind", "surf", "tide", "water", "light", "sky"].flatMap((key) => all.filter((x) => x.label.toLowerCase().includes(key) || key === "sky" && x.key === "rain")).slice(0,6);
  if (!f.length) return null;
  const safety = (c.rec.gates?.length ?? 0) > 0;
  return h("section", { class: "card", "aria-label": "Conditions" }, h("div", { class: "card-h" }, h("h2", {}, "Conditions")),
    h("div", { class: "stats" }, f.map((x) => h("div", { class: `stat${x.available === false ? " off" : ""}` },
      h("p", { class: "k" }, effectMark(x.effect, x.limiting && safety), x.label), h("p", { class: "v" }, x.available === false ? "Unavailable" : msg(x.humanLabel)),
      h("p", { class: "d" }, x.value == null || typeof x.value === "string" ? "" : `${+x.value.toFixed(1)} ${x.unit ?? ""}`.trim())))));
}
function conditionsStrip(c) {
  const spotId = c.rec.locationId, factors = c.run._proto?.factors ?? [];
  const hourlyRows = observationRows(c.run, "hourlyForecast", spotId);
  const hourly = observationFor(hourlyRows, c.now) ?? hourlyRows.find((x) => dayKey(x.startTime ?? x.validFrom) === dayKey(c.now));
  const tempF = temperatureF(hourly);
  const windFactor = factors.find((x) => x.key === "wind");
  const windRaw = hourly?.windSpeed;
  const windValue = windRaw != null ? fmtWind(hourly) : windFactor?.value != null ? `${windFactor.value} ${windFactor.unit ?? ""}`.trim() : msg(windFactor?.humanLabel ?? "");
  const waterFactor = factors.find((x) => x.key === "waterTemp")?.value;
  const waterObs = observationFor(observationRows(c.run, "waterTemperature", spotId), c.now)?.temperatureF;
  const water = waterFactor ?? waterObs;
  const wave = observationFor([...observationRows(c.run, "waves", spotId), ...observationRows(c.run, "waveForecast", spotId)], c.now);
  // Ocean buoy waves mean little in the ICW; tide direction is what matters there.
  const tideNow = c.rec.mode === "inshore" ? tideDirectionAt(observationRows(c.run, "tidePredictions", spotId), c.now) : null;
  const rows = [
    [tempF != null ? `${Math.round(tempF)}°F` : "—", "Air"],
    [windValue || "—", "Wind"],
    c.rec.mode === "inshore" ? [tideNow ? cap(tideNow) : "—", "Tide"] : [wave ? `${(+wave.waveHeightM * 3.28084).toFixed(1)} ft` : "—", "Waves"],
    [water != null && Number.isFinite(+water) ? `${(+water).toFixed(0)}°F` : "—", "Water"],
  ];
  return h("section", { class: "card conditions-strip", "aria-label": "Conditions strip" }, rows.map(([value, label]) => h("div", { class: "condition-cell" }, h("b", {}, value), h("small", {}, label))));
}
function tvCard(c) {
  const d = c.run.days ?? [];
  if (d.length < 2) return null;
  const todayRun = c.def.live ? D[RICH] : D[c.def.file];
  const cmp = pickComparison(st.h === "today" ? c.rec : todayRun.recommendation);
  const card = (label, day, target) => { const w = dayOpenWindows(day)[0], onlyClosed = dayOnlyClosedWindows(day);
    return h("button", { class: "tv-c", type: "button", style: "text-align:left;cursor:pointer;color:inherit", onclick: () => { st.h = target; st.t = null; render({ resetScroll: false }); window.scrollTo({ top: 0 }); } },
      h("p", { class: "k" }, label, h("span", { class: "vchip", "data-v": onlyClosed ? null : day.verdict }, dayVerdictLabel(day))),
      w ? h("p", { class: "w" }, fmtRange(w.start, w.end)) : h("p", { class: "w" }, onlyClosed ? "No open window" : "No good window"),
      w ? h("p", { class: "s" }, [w.displayName, cap(partWord(w.start))].filter(Boolean).join(" · ")) : h("p", { class: "s" }, cap(msg(day.reason)))); };
  return h("section", { class: "card", "aria-label": "Today versus tomorrow" }, h("div", { class: "card-h" }, h("h2", {}, "Today vs tomorrow")),
    cmp ? h("p", { class: "delta" }, DELTA[cmp]) : null, h("div", { class: "tv" }, card("Today", d[0], "today"), card("Tomorrow", d[1], "tomorrow")));
}
function spotsTeaser(c) {
  const rows = excludeSpot(spotRows(c.run, "all", c.now, st.h), st.spot ?? c.rec?.locationId).slice(0, 6);
  if (!rows.length) return null;
  return h("section", { class: "card", "aria-label": "Other spots" }, h("div", { class: "card-h" }, h("h2", {}, "Other spots"), h("button", { class: "btn-s", type: "button", "data-fk": "allspots", onclick: () => go("spots") }, "See all spots")),
    h("div", { class: "other-spots-scroll" }, rows.map(({loc,rec}) => h("button", { class: "other-spot-card", type: "button", onclick: (e) => openSpotDetail(loc.id,rec.mode,e.currentTarget) }, spotPhoto(loc.id,"other-spot-photo",loc.name), h("b",{},loc.name), h("span",{class:"vchip","data-v":rec.verdict},VERDICT_SPOKEN[rec.verdict]), h("small",{},fmtRange(rec.window?.start,rec.window?.end))))));
}
function sourcesCard(c) {
  const run = c.run, srcs = run.inputs?.sourceStatus ?? [], missing = srcs.filter((x) => x.available === false || x.stale);
  const missingKinds = [...new Set(missing.map((x) => x.kind))];
  const usesOpenMeteo = srcs.some((x) => x.provider === "open-meteo");
  const summaries = sourceSummaries(srcs, c.fr.level !== "fresh", fmtTime);
  const det = h("details", { class: "card use", open: session.sources || null, id: "sources" });
  det.addEventListener("toggle", () => { session.sources = det.open; });
  det.append(h("summary", { "data-fk": "sources" }, h("span", {}, "Data & sources"), missingKinds.length ? h("span", { class: "vchip amber" }, `${missingKinds.length} missing`) : null),
    h("div", { class: "det-body" }, h("ul", { class: "src-list" }, summaries.map((x) =>
      h("li", { "data-bad": x.status !== "current" ? "" : null }, h("span", {}, x.label), h("span", {}, x.status === "unavailable" || c.fr.level !== "fresh" && x.status === "current" ? x.state : `${x.state} · ${fmtTime(x.fetchedAt)}`)))),
      missingKinds.length ? h("p", { class: "fine" }, `Missing right now: ${missingKinds.map((kind) => (summaries.find((x) => x.kind === kind)?.label ?? kind).toLowerCase()).join(", ")}.`) : null,
      usesOpenMeteo ? h("p", { class: "fine" }, "Weather and marine forecast fallback: Open-Meteo. Its API does not expose a model issue time here, so fallback forecasts cannot satisfy GO freshness checks or tomorrow's wave gate. Data by ",
        h("a", { href: "https://open-meteo.com/", target: "_blank", rel: "noopener noreferrer" }, "Open-Meteo"),
        " under ", h("a", { href: "https://creativecommons.org/licenses/by/4.0/", target: "_blank", rel: "noopener noreferrer" }, "CC BY 4.0"), ".") : null,
      h("p", { class: "fine" }, `Model ${run.modelVersion} · run ${fmtTime(run.generatedAt)} · all times Eastern. Prototype data.`)));
  return det;
}

/* ---------- SPOTS ---------- */
function spotRows(run, filter, now = Date.now(), horizon = st.h) {
  const by = run.scopeViews?.byLocation ?? {}, favs = store.get("favs", []);
  const rows = [];
  (run.locations ?? []).forEach((loc, order) => {
    const entries = openModes(loc.id, loc.modes.filter((m) => filter === "all" || m === filter), SPOTS).map((m) => by[`${loc.id}:${m}`]?.recommendation).filter(Boolean);
    if (!entries.length) return;
    const rec = entries.sort((a, b) => TIER[a.verdict] - TIER[b.verdict] || b.suitability - a.suitability)[0];
    const dist = session.near && session.near !== "denied" ? haversine(session.near, loc) : null;
    const ended = horizon === "today" && validDate(rec.window?.end) && Date.parse(rec.window.end) <= now;
    rows.push({ loc, rec, order, fav: favs.includes(loc.id), dist, ended, bucket: Math.floor(rec.suitability / 5) });
  });
  // Display order: verdict tier, active before ended, 5-point buckets, then Near me, favourite, catalog.
  return rows.sort((a, b) => Number(b.fav) - Number(a.fav) || TIER[a.rec.verdict] - TIER[b.rec.verdict] || Number(a.ended) - Number(b.ended) || b.bucket - a.bucket || (a.dist != null && b.dist != null ? a.dist - b.dist : 0) || a.order - b.order);
}
function spotRowEl(r, c, { star = true, onPick } = {}) {
  const { loc, rec } = r;
  const top = rec.targets?.[0];
  const pick = () => matchMedia("(min-width:900px)").matches && st.tab === "spots" ? openSpotDetail(loc.id, rec.mode) : (onPick ?? ((l, m) => scope({ spot: l, mode: m, persist: true })))(loc.id, st.f === "all" ? (loc.modes.length > 1 ? null : loc.modes[0]) : st.f);
  const favs = store.get("favs", []);
  return h("li", { class: `row${st.spot === loc.id ? " sel" : ""}${star ? "" : " nostar"}` },
    h("button", { class: "main", type: "button", "data-fk": `spot-${loc.id}`, "aria-label": `${loc.name}, ${rec.verdict}, ${rec.mode}, ${fmtRange(rec.window?.start, rec.window?.end)}${r.ended ? ", ended" : ""}${top ? `, ${top.name} ${top.suitability}` : ""}`, onclick: pick },
      spotPhoto(loc.id, "spot-row-photo", loc.name),
      h("div", { class: "r1" }, h("span", { class: "nm" }, loc.name), closureFor(loc.id) ? h("span", { class: "closure-badge" }, closureBadgeText(loc.id)) : null),
      h("p", { class: `r2${r.ended ? " muted" : ""}` }, h("span", { class: "mi" }, loc.modes.filter((mode) => !isModeClosed(loc.id, mode)).map((m) => modeIcon(m))), `${modeDisplay(rec.mode,loc.id)} · ${loc.area} · `, h("span", { class: "when" }, fmtRange(rec.window?.start,rec.window?.end)), r.ended ? h("span", { class: "ended-tag" }, "Ended") : null, r.dist != null ? ` · ${r.dist.toFixed(1)} mi` : ""),
      h("p", { class: "r2 r3" }, top ? `${top.name} ${top.suitability}` : "")),
    star ? h("button", { class: "star", type: "button", "data-fk": `star-${loc.id}`, "aria-pressed": String(favs.includes(loc.id)), "aria-label": `Favourite ${loc.name}`, onclick: () => { const f = store.get("favs", []); tick(); store.set("favs", f.includes(loc.id) ? f.filter((x) => x !== loc.id) : [...f, loc.id]); rerenderList(); } }, icon("star")) : null);
}
let listHost = null;
function rerenderList() { if (listHost) { const fk = document.activeElement?.dataset?.fk; listHost.rebuild(); if (fk) listHost.el.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true }); } }
function spotList(c, { onPick, externalFilters = false } = {}) {
  const el = h("div", { class: "spotlist" });
  const filterBar = h("div", { class: "tools-row" }, segment("Mode filter", [["all", "All"], ["surf", "Surf"], ["pier", "Pier"], ["inshore", "Inshore"]], st.f, (v) => { st.f = v; rebuild(); document.querySelector(`[data-fk="Mode filter-${v}"]`)?.focus({ preventScroll: true }); }),
    h("button", { class: "btn-s near", type: "button", "data-fk": "near", "aria-pressed": String(!!session.near && session.near !== "denied"), onclick: askNear, "aria-label": "Sort by distance" }, icon("pin")));
  if (externalFilters) el.filters = filterBar;
  const rebuild = () => {
    const rows = spotRows(c.run, st.f, c.now, st.h).filter((r) => !st.search || r.loc.name.toLowerCase().includes(st.search.toLowerCase()));
    const best = c.overall ?? c.rec ?? c.run.recommendation;
    const anyRow = h("li", { class: `row any nostar${!st.spot ? " sel" : ""}` }, h("button", { class: "main", type: "button", "data-fk": "spot-any", "aria-label": `Best anywhere, ${best.verdict}, currently ${best.displayName}`, onclick: () => (onPick ?? (() => scope({ persist: true })))(null, null) },
      h("div", { class: "r1" }, h("span", { class: "nm" }, "Best anywhere"), h("span", { class: "vchip", "data-v": best.verdict }, VERDICT_SPOKEN[best.verdict])),
      h("p", { class: "r2" }, `Follows the best spot · now ${best.displayName}`)));
    const favRows = rows.filter((r) => r.fav);
    filterBar.querySelector("[data-fk='near']")?.setAttribute("aria-pressed", String(!!session.near && session.near !== "denied"));
    const content = [];
    if (!externalFilters) content.push(filterBar);
    if (session.near === "denied") content.push(h("p", { class: "notice", role: "status" }, "Location is off — showing best first."));
    content.push(h("ul", { class: "list" }, anyRow, ...["GO", "MAYBE", "SKIP"].flatMap((v) => { const group = rows.filter((r) => r.rec.verdict === v); return group.length ? [h("li", { class: "tier eyebrow" }, VERDICT_SPOKEN[v]), ...group.map((r) => spotRowEl(r,c,{onPick}))] : []; })));
    el.replaceChildren(...content);
  };
  function askNear() {
    if (session.near && session.near !== "denied") { session.near = null; rebuild(); return; }
    if (!navigator.geolocation) { session.near = "denied"; rebuild(); return; }
    navigator.geolocation.getCurrentPosition((p) => { session.near = { lat: p.coords.latitude, lon: p.coords.longitude }; rebuild(); }, () => { session.near = "denied"; rebuild(); }, { timeout: 6000, maximumAge: 600000 });
  }
  listHost = { el, rebuild }; rebuild();
  return el;
}
function spotsView(c) {
  // The card map is a non-interactive preview (swipes and scrolling pass over it); the map itself is the button to the full map.
  const openMap = () => window.FFNativeMap?.expand?.();
  const map = window.FFNativeMap
    ? h("div", { id: "spots-map", class: "native-map-slot", role: "button", tabindex: "0", "aria-label": "Map of fishing spots. Open full map", onclick: openMap, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMap(); } } })
    : h("div", { class: "web-map-placeholder compact-map" }, h("span", {}, "Explore nearby spots"));
  const list = spotList(c, { externalFilters: true });
  const featured = c.run.locations?.find((x) => x.id === (st.spot ?? c.rec.locationId));
  const rec = featured && (st.mode && !isModeClosed(featured.id, st.mode) ? c.run.scopeViews?.byLocation?.[`${featured.id}:${st.mode}`]?.recommendation : bestModeRec(c.run, featured.id)) || c.rec;
  const favs = store.get("favs", []);
  const featureCard = featured ? h("section", { class: "card spot-feature" }, spotPhoto(featured.id, "spot-feature-photo", featured.name),
    h("div", { class: "spot-feature-head" }, h("div", {}, h("p", { class: "eyebrow" }, "Selected spot"), h("h2", {}, featured.name), closureFor(featured.id) ? h("span", { class: "closure-badge" }, closureBadgeText(featured.id)) : null),
      h("button", { class: "star", type: "button", "aria-pressed": String(favs.includes(featured.id)), "aria-label": `Favourite ${featured.name}`, onclick: () => { store.set("favs", favs.includes(featured.id) ? favs.filter((x) => x !== featured.id) : [...favs, featured.id]); render(); } }, icon("star"))),
    h("p", {}, h("span", { class: "vchip", "data-v": rec.verdict }, `${rec.verdict} · ${formatHeadline({ recommendation: rec })}`)),
    h("p", { class: "fine" }, (rec.targets ?? []).slice(0, 3).map((x) => x.name).join(" · ")),
    spotMiniStats(c, featured.id),
    h("button", { class: "btn", type: "button", onclick: (e) => openSpotDetail(featured.id, rec.mode, e.currentTarget) }, "View details")) : null;
  return [h("section", { class: "spots-layout", "aria-label": "Spots" }, h("div", { class: "page-heading" }, h("h1", {}, "Spots"), h("div", { class: "page-actions" }, h("button", { class: "icon-button", type: "button", "aria-label": "Manage favorites", onclick: (e) => openFavoritesSheet(e.currentTarget) }, "♥"))),
    list.filters, searchBox("Search spots", st.search, (e) => { st.search = e.target.value; listHost?.rebuild(); }), map, featureCard, list)];
}
function spotMiniStats(c, locationId) {
  const waves = [...observationRows(c.run, "waves", locationId), ...observationRows(c.run, "waveForecast", locationId)];
  const coastal = locOf(c.run, locationId)?.modes?.some((m) => m !== "inshore") ?? true;
  const wave = coastal ? waves.find((x) => x.waveHeightM != null && Number.isFinite(+x.waveHeightM)) : null;
  const hourly = observationFor(observationRows(c.run, "hourlyForecast", locationId), c.now);
  const tides = observationRows(c.run, "tidePredictions", locationId).filter((x) => x.time && Number.isFinite(+x.heightFt)).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const now = Date.now(), ti = tides.findIndex((x) => Date.parse(x.time) >= now), a = tides[Math.max(0, ti - 1)], b = tides[ti];
  const rising = a && b ? +b.heightFt > +a.heightFt : null;
  const water = observationRows(c.run, "waterTemperature", locationId).find((x) => Number.isFinite(+x.temperatureF));
  const airValue = temperatureF(hourly);
  const airTemp = airValue != null ? `${Math.round(airValue)}°F · ${hourly.shortForecast ?? "Air"}` : null;
  const stats = [airTemp ? [airTemp, "Air"] : null, hourly?.windSpeed != null ? [fmtWind(hourly), "Wind"] : null,
    wave ? [`${(+wave.waveHeightM * 3.28084).toFixed(1)} ft`, "Waves"] : null, water ? [`${Math.round(+water.temperatureF)}°F`, "Water"] : null].filter(Boolean);
  return stats.length ? h("div", { class: "spot-mini-stats" }, stats.map(([value, label]) => h("div", {}, h("b", {}, value), h("small", {}, label)))) : null;
}

/* ---------- SPECIES ---------- */
function speciesRows(c) {
  const run = c.run;
  const rows = SPECIES.map((sp) => {
    const cands = (run.candidates ?? []).filter((x) => !isModeClosed(x.locationId,x.mode) && x.speciesId === sp.id && (st.f === "all" || x.mode === st.f));
    const best = bestSpeciesCandidate(cands);
    const rawFocused = run.scopeViews?.bySpecies?.[sp.id]?.focused ?? null;
    const focused = rawFocused && !isModeClosed(rawFocused.locationId, rawFocused.mode) ? rawFocused : null;
    const focusedCandidate = focused && cands.find((x) => x.locationId === focused.locationId && x.mode === focused.mode);
    return { sp, best: focusedCandidate ?? best, focused, suit: focused?.suitability ?? best?.suitability ?? null };
  }).filter((x) => st.f === "all" || x.sp.modes.includes(st.f));
  return rankSpeciesRows(rows);
}
function speciesView(c) {
  const rows = speciesRows(c);
  const tiles = (items) => h("ul", { class: "grid" }, items.map(({ sp, best, suit, focused }) => {
    const notRealistic = !focused && best?.eligibility !== "realistic";
    const showScore = suit != null && !notRealistic;
    return h("li", {}, h("button", { class: `sp${!showScore ? " dimmed" : ""}${st.species === sp.id ? " on" : ""}`, type: "button", "data-fk": `sp-${sp.id}`,
      "aria-label": `${sp.name}, ${showScore ? `suitability ${suit}` : notRealistic ? speciesEligibilityLabel(best) : "no reading"}${sp.bycatch ? ", bycatch" : ""}`, onclick: (e) => openSpecies(sp.id, e.currentTarget) },
      fishImage(sp.id, "species-thumb"), h("p", { class: "n" }, sp.name, sp.bycatch ? h("span", { class: "tag" }, "Bycatch") : null),
      showScore ? h("div", { class: "big" }, h("b", {}, suit), h("span", {}, speciesFitBand(suit))) : null,
      best && best.eligibility !== "realistic" ? h("span", { class: "tag eligibility" }, speciesEligibilityLabel(best)) : null,
      best?.historicalRate ? h("small", { class: "trip-rate" }, speciesTripRate(best)) : null,
      showScore ? h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${suit}%` })) : null));
  }));
  return [h("section", { class: "card species-browser", "aria-label": "Species" },
    h("div", { class: "page-heading" }, h("h1", {}, "Species")),
    searchBox("Search species", st.search, (e) => { st.search = e.target.value; render(); }),
    h("p", { class: "fine" }, "Realistic targets first · ranked by today's conditions fit"), h("p", { class: "fine eligibility-legend" }, "Dimmed means the fish is less commonly caught, off-list, or needs structure, so no score is shown."),
    h("div", { class: "species-carousel" }, rows.filter((x) => !x.sp.bycatch && (st.search === "" || x.sp.name.toLowerCase().includes(st.search.toLowerCase()))).slice(0, 12).map(({ sp }) => h("button", { class: `species-avatar${st.species === sp.id ? " on" : ""}`, type: "button", "aria-label": sp.name, onclick: (e) => openSpecies(sp.id, e.currentTarget) }, fishImage(sp.id), h("span", {}, sp.name)))),
    h("div", { class: "tools-row" }, segment("Mode filter", [["all", "All"], ["surf", "Surf"], ["pier", "Pier"], ["inshore", "Inshore"]], st.f, (v) => { st.f = v; render(); })), tiles(rows.filter((x)=>!x.sp.bycatch && (!st.search || x.sp.name.toLowerCase().includes(st.search.toLowerCase())))), h("details",{class:"also",open:session.also||null,ontoggle:(e)=>{session.also=e.currentTarget.open;}},h("summary",{},"Also biting (bycatch)"),tiles(rows.filter((x)=>x.sp.bycatch && (!st.search || x.sp.name.toLowerCase().includes(st.search.toLowerCase()))))))];
}

/* ---------- PLAN ---------- */
function dayOpenWindows(day) { return openModeRows(day?.windows ?? [], SPOTS); }
function dayOnlyClosedWindows(day) { return (day?.windows?.length ?? 0) > 0 && dayOpenWindows(day).length === 0; }
function dayVerdictLabel(day) { return dayOnlyClosedWindows(day) ? "No open window" : VERDICT_SPOKEN[day?.verdict] ?? day?.verdict ?? "Outlook"; }
function daySummary(c, day, index) {
  if (!day || day.kind !== "forecast") return "";
  const forecastRun = [c.run, D[RICH], D[TOMORROW], D[c.def.file], D[TOMORROW_SAMPLE]].find((candidate) => candidate?.targetDate === day.date) ?? (index === 1 ? (c.def.live ? D[TOMORROW] : D[TOMORROW_SAMPLE]) ?? c.run : c.run);
  const rec = forecastRun?.recommendation, window = openModeRows(day.windows ?? [], SPOTS)[0], target = day.topSpecies?.[0];
  const pieces = [dayVerdictLabel(day)];
  if (window) pieces.push(`${fmtRange(window.start,window.end)} at ${window.displayName ?? locOf(forecastRun,window.locationId)?.name ?? "the selected spot"}`);
  if (target?.name) pieces.push(target.name.toLowerCase());
  const locationId = window?.locationId ?? rec?.locationId, date = day.date;
  const targetAt = window?.start ?? `${date}T12:00:00-04:00`;
  const hourlyRows = observationRows(forecastRun ?? c.run, "hourlyForecast", locationId).filter((x) => dayKey(x.startTime ?? x.validFrom) === date);
  const hourly = hourlyRows.find((x) => inPeriod(x, targetAt)) ?? hourlyRows[0];
  const waveRows = [...observationRows(forecastRun ?? c.run, "waves", locationId), ...observationRows(forecastRun ?? c.run, "waveForecast", locationId)];
  const wave = observationFor(waveRows, targetAt);
  const conditions = [];
  if (hourly?.windSpeed != null) conditions.push(`wind ${fmtWind(hourly)}`.replace(/\s+/g," ").trim());
  // Ocean buoy waves mean little in the ICW; only quote them for surf and pier windows.
  if (wave && (window?.mode ?? rec?.mode) !== "inshore") conditions.push(`waves ${(+wave.waveHeightM * 3.28084).toFixed(1)} ft`);
  if (conditions.length) pieces.push(conditions.join(" · "));
  else if (rec?.reason?.text) pieces.push(msg(rec.reason));
  return pieces.join(" · ");
}
function dayBody(d, i, summary = "", run = null) {
  const outlook = d.kind === "outlook", bw = d.bestWindow ?? {};
  const windows = dayOpenWindows(d), onlyClosed = dayOnlyClosedWindows(d);
  return h("div", {}, h("span", { class: `vchip${outlook ? " outline" : ""}`, "data-v": outlook || onlyClosed ? null : d.verdict, "data-l": d.outlookLabel }, outlook ? d.outlookLabel : dayVerdictLabel(d)),
    outlook ? null : h("p", { class: "fine day-summary" }, summary),
    outlook ? h("p", {}, [cap(bw.partOfDay), bw.tidePhase ? `${bw.tidePhase} tide` : null].filter(Boolean).join(" · ")) : h("ul", { class: "wins" }, windows.map((w) => h("li", {}, [w.displayName ?? locOf(run,w.locationId)?.name, modeDisplay(w.mode,w.locationId)].filter(Boolean).join(" · "), fmtRange(w.start,w.end)))),
    h("ul", { class: "targets" }, (d.topSpecies ?? []).slice(0,3).map((t) => h("li", {}, h("button", { class: "t-btn", type: "button", onclick: (e) => openSpecies(t.speciesId,e.currentTarget) }, t.name, h("span", {}, t.suitability ?? ""))))),
    !outlook ? h("button", { class: "btn", type: "button", onclick: () => closeSheet().then(() => { st.h = i === 0 ? "today" : "tomorrow"; st.t = null; go("today"); }) }, `Open ${i === 0 ? "Today" : "Tomorrow"}`) : null);
}
function planTideChart(c, locationId, date, run = c.run) {
  const rows = observationRows(run, "tidePredictions", locationId).filter((x) => x.time && dayKey(x.time) === date && x.heightFt != null && Number.isFinite(+x.heightFt));
  if (rows.length < 2) return null;
  const heights = rows.map((x) => +x.heightFt), lo = Math.min(...heights), hi = Math.max(...heights), span = Math.max(.1, hi - lo), xAt = (i) => i / (rows.length - 1) * 100, yAt = (height) => 88 - (height - lo) / span * 68;
  const points = [];
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < 12; j++) { const u = j / 12, eased = (1 - Math.cos(Math.PI * u)) / 2, height = heights[i] * (1 - eased) + heights[i + 1] * eased; points.push([xAt(i) + (xAt(i + 1) - xAt(i)) * u, yAt(height)]); }
  points.push([xAt(rows.length - 1), yAt(heights.at(-1))]);
  const line = points.map(([x,y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "), area = `0,100 ${line} 100,100`;
  const nowIndex = date === run.targetDate && Date.now() >= Date.parse(rows[0].time) && Date.now() <= Date.parse(rows.at(-1).time) ? (Date.now() - Date.parse(rows[0].time)) / (Date.parse(rows.at(-1).time) - Date.parse(rows[0].time)) * 100 : null;
  return h("section", { class: "card tide-chart", "aria-label": "Tide chart" }, h("div", { class: "card-h" }, h("h2", {}, "Tide chart"), h("span", { class: "sub" }, "Predicted highs and lows")),
    s("svg", { viewBox: "-2 -18 104 120", preserveAspectRatio: "none", role: "img", "aria-label": "Predicted tide height through the day" }, s("defs", {}, s("linearGradient", { id: "tide-fill", x1: "0", y1: "0", x2: "0", y2: "1" }, s("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": ".30" }), s("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": ".02" }))), s("polygon", { points: area, fill: "url(#tide-fill)" }), s("polyline", { points: line, fill: "none", stroke: "var(--accent)", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }), rows.map((x, i) => s("g", {}, s("circle", { cx: xAt(i), cy: yAt(+x.heightFt), r: 1.8, fill: "var(--accent)" }), s("text", { x: xAt(i), y: yAt(+x.heightFt) - 4, "text-anchor": i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle", class: "tide-mark" }, `${x.type === "H" ? "H" : "L"} ${fmtTime(x.time)} · ${(+x.heightFt).toFixed(1)}′`))), nowIndex == null ? null : s("g", {}, s("line", { x1: nowIndex, x2: nowIndex, y1: 5, y2: 92, class: "tide-now" }), s("text", { x: nowIndex, y: 10, "text-anchor": nowIndex > 82 ? "end" : "start", class: "tide-now-label" }, "Now"))),
    h("div", { class: "tide-events" }, rows.map((x) => h("div", {}, h("b", {}, x.type === "H" ? "High" : x.type === "L" ? "Low" : cap(x.type ?? "Tide")), h("span", {}, fmtTime(x.time)), h("small", {}, `${(+x.heightFt).toFixed(1)} ft`)))));
}
function planHourlyTable(c, locationId, date, mode, run = c.run) {
  const hourly = observationRows(run, "hourlyForecast", locationId).filter((x) => (x.startTime ?? x.validFrom) && dayKey(x.startTime ?? x.validFrom) === date);
  const waves = [...observationRows(run, "waves", locationId), ...observationRows(run, "waveForecast", locationId)];
  if (!hourly.length) return null;
  const slots = isModeClosed(locationId, mode) ? [] : (run.slots ?? []).find((x) => x.locationId === locationId && x.mode === mode)?.slots ?? [];
  const rows = hourly.filter((x) => new Date(x.startTime ?? x.validFrom).getMinutes() === 0).slice(0, 12);
  const skyIcon = (label) => {
    const text = String(label ?? "").toLowerCase();
    const glyph = /thunder|storm/.test(text) ? "ϟ" : /rain|shower/.test(text) ? "☂" : /cloud|overcast|fog/.test(text) ? "☁" : /night|clear/.test(text) ? "☾" : "☀";
    return h("span", { class: "sky-icon", "aria-hidden": "true" }, glyph);
  };
  return h("section", { class: "card hourly-card", "aria-label": "Hourly fishing forecast" }, h("div", { class: "card-h" }, h("h2", {}, "Hourly fishing forecast")),
    h("div", { class: "hourly-scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Time", "Sky", "Conditions", "Outlook"].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows.map((x) => {
      const at = x.startTime ?? x.validFrom, slot = slots.reduce((best, p) => !best || Math.abs(Date.parse(p.at) - Date.parse(at)) < Math.abs(Date.parse(best.at) - Date.parse(at)) ? p : best, null);
      const usableSlot = slot && Math.abs(Date.parse(slot.at) - Date.parse(at)) <= 30 * 60000 && Number.isFinite(slot.suitability) ? slot : null;
      const wave = observationFor(waves, at) ?? waves.find((w) => Math.abs(Date.parse(w.time ?? w.validFrom ?? w.startTime) - Date.parse(at)) < 5400000);
      const mph = fmtWind(x);
      const ft = wave?.waveHeightM != null && Number.isFinite(+wave.waveHeightM) ? `${(+wave.waveHeightM * 3.28084).toFixed(0)}–${(+wave.waveHeightM * 3.28084 + .5).toFixed(0)} ft` : "";
      const sky = (x.shortForecast ?? "").replace(/Slight Chance Showers And Thunderstorms|Chance Showers And Thunderstorms|Showers And Thunderstorms/gi, "Chance of storms").replace(/Mostly Sunny|Partly Sunny/gi, "Partly sunny");
      const candidateWindows = (run.candidates ?? []).filter((candidate) => candidate.locationId === locationId && candidate.mode === mode).map((candidate) => candidate.window).filter(Boolean);
      const insideWindow = candidateWindows.some((window) => Date.parse(window.start) <= Date.parse(at) && Date.parse(window.end) > Date.parse(at));
      const fit = usableSlot?.suitability;
      const outlook = hourlyOutlook(fit, insideWindow), dataFit = outlook === "Great" ? "good" : outlook === "Good" ? "fair" : outlook === "Poor" ? "poor" : "none";
      return h("tr", {}, h("td", {}, fmtTime(at)), h("td", { class: "sky-cell", "aria-label": sky }, skyIcon(sky)), h("td", { class: "hour-conditions" }, [mph, ft].filter(Boolean).join(" · ") || "Conditions unavailable"), h("td", { class: "outlook-word", "data-fit": dataFit }, outlook));
    })))));
}
function planView(c) {
  const days = c.run.days ?? D[RICH].days;
  st.day = Math.max(0, Math.min(st.day, days.length - 1));
  const selected = days[st.day] ?? days[0], selectedLoc = st.spot ?? c.rec.locationId, selectedMode = st.mode ?? c.rec.mode;
  const forecastRun = [c.run, D[RICH], D[TOMORROW]].find((candidate) => candidate?.targetDate === selected?.date) ?? c.run;
  const observations = ["hourlyForecast", "waves", "waveForecast", "waterTemperature"].flatMap((kind) => observationRows(forecastRun, kind, selectedLoc));
  const selectedWindow = dayOpenWindows(selected)[0];
  const selectedAt = selectedWindow?.start ?? `${selected?.date}T12:00:00-04:00`;
  const hours = observationRows(forecastRun, "hourlyForecast", selectedLoc).filter((x) => dayKey(x.startTime ?? x.validFrom) === selected?.date);
  const firstHour = observationFor(hours, selectedAt) ?? hours[0];
  const temperatureValue = temperatureF(firstHour);
  const temperature = temperatureValue == null ? null : { ...firstHour, temperature: temperatureValue, temperatureUnit: "F" };
  const selectedOutlook = selected?.kind === "outlook" ? selected.outlookLabel : dayVerdictLabel(selected);
  const selectedCopy = daySummary(c, selected, st.day) || selected?.reason?.text || selected?.reason || "";
  const tide = selected?.date === forecastRun.targetDate ? planTideChart(c, selectedLoc, selected.date, forecastRun) : null;
  const hourlyTable = selected?.date === forecastRun.targetDate ? planHourlyTable(c, selectedLoc, selected.date, selectedMode, forecastRun) : null;
  const summary = h("section", { class: "card daily-outlook" }, h("div", { class: "card-h" }, h("span", { class: "vchip", "data-v": selected?.kind === "outlook" || dayOnlyClosedWindows(selected) ? null : selected?.verdict }, selectedOutlook), h("h2", {}, "Daily outlook")), h("p", {}, msg(selectedCopy)),
    observations.length ? h("div", { class: "plan-conditions" }, temperature ? h("div", {}, h("i", { class: "condition-icon", "aria-hidden": "true" }, "☀"), h("b", {}, `${Math.round(temperature.temperature)}°F`), h("small", {}, temperature.shortForecast ?? "Air")) : null,
      firstHour?.windSpeed ? h("div", {}, h("i", { class: "condition-icon", "aria-hidden": "true" }, "↗"), h("b", {}, fmtWind(firstHour)), h("small", {}, "Wind")) : null,
      selectedMode !== "inshore" && (() => { const waves = observations.filter((x) => x.waveHeightM != null && Number.isFinite(+x.waveHeightM)); const wave = observationFor(waves, selectedAt) ?? waves[0]; return wave ? h("div", {}, h("i", { class: "condition-icon", "aria-hidden": "true" }, "〰"), h("b", {}, `${(+wave.waveHeightM * 3.28084).toFixed(1)} ft`), h("small", {}, "Waves")) : null; })(),
      (() => { const water = observations.find((x) => x.temperatureF != null && Number.isFinite(+x.temperatureF)); return water ? h("div", {}, h("i", { class: "condition-icon", "aria-hidden": "true" }, "♨"), h("b", {}, `${Math.round(+water.temperatureF)}°F`), h("small", {}, "Water")) : null; })()) : null);
  const list = h("ul", { class: "days" }, days.flatMap((d,i) => {
    const outlook = d.kind === "outlook", w = dayOpenWindows(d)[0], onlyClosed = dayOnlyClosedWindows(d), bw = d.bestWindow ?? {};
    const title = i === 0 ? "Today" : wk(d.date,{weekday:"short"});
    const ended = i === 0 && w && Number.isFinite(Date.parse(w.end)) && Date.parse(w.end) <= c.now;
    const range = w ? fmtRange(w.start,w.end) : "";
    const line = outlook ? [cap(bw.partOfDay), bw.tidePhase ? `${bw.tidePhase} tide` : null].filter(Boolean).join(" · ") : w ? ended ? w.displayName : `${[range,w.displayName].filter(Boolean).join(" · ")}` : onlyClosed ? "No open window" : "No good window";
    return [i === 2 ? h("li", { class: "outlook-caption" }, h("h3", {}, "Outlook · days 3–7"), h("p", { class: "fine" }, "Outlook for days 3–7 uses season, tides, moon and the daily forecast. It updates daily.")) : null,
      h("li", {}, h("button", { class: `day-row${i >= 2 ? " outlook" : ""}`, type: "button", "data-fk": `day-${i}`, onclick: (e) => { st.day=i; const pane=document.querySelector(".plan-detail"); if(matchMedia("(min-width:900px)").matches && pane) pane.replaceChildren(h("h2",{},title),dayBody(d,i,daySummary(c,d,i),c.run)); else openSheet(title,dayBody(d,i,daySummary(c,d,i),c.run),e.currentTarget); } },
        h("span", {}, title,h("small",{},wk(d.date,{month:"short",day:"numeric"}))), h("span",{class:`vchip${outlook ? " outline" : ""}`,"data-v":outlook||onlyClosed?null:d.verdict,"data-l":d.outlookLabel},outlook?d.outlookLabel:dayVerdictLabel(d)),
        h("span", {class:"day-copy"},h("span", {class:"day-line"},line),ended ? h("small",{class:"ended"},`Ended · ${range}`) : null,h("small",{},(d.topSpecies??[]).map((t)=>t.name).slice(0,1).join(" · ")), d.bestDay ? h("span",{class:"tag"},outlook ? "Most promising outlook" : "Best day this week") : null),icon("arrow")))];
  }));
  const chips = h("div", { class: "plan-day-chips", role: "tablist", "aria-label": "Plan day" }, days.map((d, i) => h("button", { class: "day-chip", type: "button", role: "tab", "aria-selected": String(i === st.day), "data-fk": `plan-day-${i}`, onclick: () => { st.day = i; render(); } }, h("b", {}, i === 0 ? "Today" : wk(d.date, { weekday: "short" })), h("small", {}, wk(d.date, { month: "short", day: "numeric" })))));
  return [h("section", { class: "plan-page" },
    h("div", { class: "page-heading" }, h("h1", {}, "Plan")), chips, summary, tide, hourlyTable,
    h("div", { class: "plan-layout" },
      h("section", { class: "card" }, h("div", { class: "card-h" }, h("h2", {}, "Next 7 days"), h("p", { class: "eyebrow" }, st.species ? `for ${spName(st.species)}` : st.spot ? locOf(c.run, st.spot)?.name : "Best anywhere")), list),
      h("section", { class: "card plan-detail desktop-pane" }, dayBody(selected, st.day, daySummary(c,selected,st.day), c.run))))];
}

/* ---------- catch log ---------- */
const activeSpot = (id) => ACTIVE_SPOTS.find((x) => x.id === id);
const wallNow = (ms = Date.now()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
function parseEasternLocal(value) {
  const [date, time] = String(value ?? "").split("T"), [year, month, day] = (date ?? "").split("-").map(Number), [hour, minute] = (time ?? "").split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return NaN;
  const desired = Date.UTC(year, month - 1, day, hour, minute); let guess = desired;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    guess = desired - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess);
  }
  return guess;
}
function reportSnapshot(c, spot, mode, at) {
  const day = (x) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(x));
  const date = day(at), run = [D[RICH], D[TOMORROW], c.run].find((candidate) => candidate?.targetDate === date && locOf(candidate, spot));
  if (!run) return null;
  const rec = run.scopeViews?.byLocation?.[`${spot}:${mode}`]?.recommendation;
  return rec ? { runGeneratedAt: run.generatedAt, verdict: rec.verdict, fit: rec.suitability } : null;
}
function sortedCatches() { return loadCatches().sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)); }
function logView(c) {
  const rows = sortedCatches();
  const stats = summarizeCatches(rows, { now: Date.now(), spotName: (id) => activeSpot(id)?.name ?? id, speciesName: (id) => id === "other" ? "Other" : spName(id) });
  const summary = h("div", { class: "log-summary" },
    h("div", { class: "stat" }, h("p", { class: "k" }, "This month"), h("p", { class: "v" }, stats.catchesThisMonth)),
    h("div", { class: "stat" }, h("p", { class: "k" }, "Top species"), h("p", { class: "v log-stat-label" }, stats.topSpeciesName ?? "—")),
    h("div", { class: "stat" }, h("p", { class: "k" }, "Best spot"), h("p", { class: "v log-stat-label" }, stats.bestSpotName ?? "—")));
  const grouped = new Map();
  for (const row of rows) { const key = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(row.occurredAt)); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row); }
  const entries = [...grouped].map(([day, list]) => {
    const heading = h("h3", {}, new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${day}T12:00:00-04:00`)));
    const items = list.map((row) => h("li", {}, h("button", { class: "log-entry", type: "button", onclick: (e) => openCatchDetail(row.id, e.currentTarget) },
      h("span", { class: "log-entry-main" }, h("b", {}, row.species === "other" ? row.otherSpecies : row.speciesName), h("span", {}, `${row.count} · ${row.disposition} · ${row.spotName}`)),
      h("span", { class: "muted" }, fmtTime(row.occurredAt)), icon("arrow"))));
    return h("section", { class: "log-day" }, heading, h("ul", { class: "log-list" }, items));
  });
  return [h("section", { class: "card log-card", "aria-label": "Catch log" },
    h("div", { class: "card-h" }, h("h2", {}, "Catch log"), h("button", { class: "btn-s", type: "button", onclick: exportCatchLog }, "Export CSV")),
    h("p", { class: "fine" }, "Saved on this device only."), summary,
    h("button", { class: "btn log-add", type: "button", hidden: !rows.length, onclick: (e) => openCatchForm(null, e.currentTarget, c) }, "Log a catch"),
    rows.length ? entries : h("div", { class: "log-empty" }, s("svg", { class: "empty-fish", viewBox: "0 0 120 64", role: "img", "aria-label": "A fish on a fishing line" }, s("path", { d: "M16 36c13-17 35-20 55-9l18-13v41L71 43c-20 11-42 8-55-7Zm-8 0h7m67-12 13-7m-13 31 13 7M51 27v18m7-18v18" }), s("circle", { cx: 42, cy: 33, r: 2 })), h("p", {}, "Your catch log starts here."), h("p", { class: "fine" }, "Log your first catch to get started."), h("button", { class: "btn", type: "button", onclick: (e) => openCatchForm(null, e.currentTarget, c) }, "Log your first catch")))];
}
function openCatchForm(existing, opener, c = ctx()) {
  const spotId = existing?.spot ?? st.spot ?? c.rec.locationId ?? ACTIVE_SPOTS[0]?.id;
  const spot = activeSpot(spotId) ?? ACTIVE_SPOTS[0];
  const form = h("form", { class: "catch-form", novalidate: "" });
  const field = (name, label, control, errorId = `error-${name}`) => h("div", { class: "field" }, h("label", { for: `catch-${name}` }, label), control, h("p", { class: "field-error", id: errorId, "aria-live": "polite" }));
  const species = h("select", { id: "catch-species", name: "species", required: "" }, h("option", { value: "" }, "Choose a species"), SPECIES.map((x) => h("option", { value: x.id }, x.name)), h("option", { value: "other" }, "Other"));
  species.value = existing?.species ?? "";
  const other = h("input", { id: "catch-other", name: "otherSpecies", type: "text", maxlength: "80", placeholder: "Enter species", hidden: existing?.species !== "other", autocomplete: "off" }); other.value = existing?.otherSpecies ?? "";
  const spotSelect = h("select", { id: "catch-spot", name: "spot" }, ACTIVE_SPOTS.map((x) => h("option", { value: x.id }, x.name))); spotSelect.value = spot.id;
  const modeSelect = h("select", { id: "catch-mode", name: "mode" });
  const updateModes = (selected) => { const s = activeSpot(spotSelect.value); modeSelect.replaceChildren(...(s?.modes ?? []).map((m) => h("option", { value: m }, modeLabel(m)))); modeSelect.value = s?.modes.includes(selected) ? selected : s?.modes[0] ?? ""; };
  updateModes(existing?.mode ?? st.mode ?? "");
  const when = h("input", { id: "catch-occurredAt", name: "occurredAt", type: "datetime-local", max: wallNow(), required: "" }); when.value = existing?.occurredAt ? wallNow(Date.parse(existing.occurredAt)) : wallNow();
  const count = h("input", { id: "catch-count", name: "count", type: "number", min: "1", max: "99", step: "1", inputmode: "numeric", required: "" }); count.value = existing?.count ?? "1";
  const disposition = segment("Kept or released", [["kept", "Kept"], ["released", "Released"]], existing?.disposition ?? "released", (v) => { form.dataset.disposition = v; }, "catch-disposition"); form.dataset.disposition = existing?.disposition ?? "released";
  const length = h("input", { id: "catch-lengthIn", name: "lengthIn", type: "number", min: "1", max: "80", step: "0.1", inputmode: "decimal", placeholder: "Optional" }); length.value = existing?.lengthIn ?? "";
  const bait = h("input", { id: "catch-bait", name: "bait", type: "text", maxlength: "120", placeholder: "Optional" }); bait.value = existing?.bait ?? "";
  const notes = h("textarea", { id: "catch-notes", name: "notes", maxlength: "500", rows: "3", placeholder: "Optional · up to 500 characters" }); notes.value = existing?.notes ?? "";
  const errors = h("div", { class: "form-errors", role: "alert", hidden: "" });
  const otherField = h("div", { class: "field other-species", hidden: existing?.species !== "other" }, h("label", { for: "catch-other" }, "Species name"), other);
  form.append(field("species", "Species", species), otherField, field("spot", "Spot", spotSelect), field("mode", "Mode", modeSelect), field("occurredAt", "Date and time", when),
    field("count", "Count", count), h("div", { class: "field" }, h("span", { class: "field-label" }, "Kept or released"), disposition, h("p", { class: "field-error", id: "error-disposition" })),
    field("lengthIn", "Length in inches", length), field("bait", "Bait or lure", bait), field("notes", "Notes", notes), errors,
    h("button", { class: "btn", type: "submit" }, existing ? "Save changes" : "Save catch"));
  species.addEventListener("change", () => { otherField.hidden = species.value !== "other"; });
  spotSelect.addEventListener("change", () => updateModes(""));
  form.addEventListener("focusin", (e) => setTimeout(() => e.target.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 80));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = { species: species.value, otherSpecies: other.value, spot: spotSelect.value, mode: modeSelect.value, occurredAt: when.value, count: count.value, disposition: form.dataset.disposition, lengthIn: length.value, bait: bait.value.trim(), notes: notes.value };
    const problems = validateCatch(values, { spotById: activeSpot });
    form.querySelectorAll(".field-error").forEach((x) => { x.textContent = ""; });
    for (const [key, message] of Object.entries(problems)) { const target = form.querySelector(`#error-${key}`); if (target) target.textContent = message; else errors.hidden = false; }
    if (Object.keys(problems).length) { errors.hidden = !Object.keys(problems).some((key) => !form.querySelector(`#error-${key}`)); if (!errors.hidden) errors.textContent = "Check the highlighted fields."; return; }
    const rows = sortedCatches(), at = new Date(parseEasternLocal(values.occurredAt)).toISOString(), pickedSpot = activeSpot(values.spot), pickedSpecies = spCat(values.species);
    const record = { schemaVersion: 1, id: existing?.id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`), species: values.species,
      speciesName: pickedSpecies?.name ?? values.otherSpecies.trim(), otherSpecies: values.species === "other" ? values.otherSpecies.trim() : "", spot: values.spot, spotName: pickedSpot.name,
      mode: values.mode, occurredAt: at, count: Number(values.count), disposition: values.disposition, lengthIn: values.lengthIn ? Number(values.lengthIn) : null,
      bait: values.bait, notes: values.notes, context: reportSnapshot(c, values.spot, values.mode, at) };
    const next = existing ? rows.map((x) => x.id === existing.id ? record : x) : [...rows, record];
    if (!saveCatches(next)) { errors.hidden = false; errors.textContent = "Couldn't save on this device. Check available storage and try again."; return; }
    closeSheet().then(() => { render(); toast(existing ? "Catch updated" : "Catch saved"); });
  });
  openSheet(existing ? "Edit catch" : "Log a catch", form, opener);
}
function openCatchDetail(id, opener) {
  const row = sortedCatches().find((x) => x.id === id); if (!row) return;
  const body = h("div", { class: "catch-detail" }, h("p", {}, `${row.count} · ${row.disposition}`), h("p", {}, `${row.spotName} · ${modeLabel(row.mode)}`),
    h("p", {}, new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date(row.occurredAt))),
    row.lengthIn ? h("p", {}, `${row.lengthIn} in`) : null, row.bait ? h("p", {}, `Bait or lure: ${row.bait}`) : null, row.notes ? h("p", {}, row.notes) : null,
    row.context ? h("p", { class: "fine" }, `Report context: ${row.context.verdict} · fit ${row.context.fit ?? "—"} · ${fmtTime(row.context.runGeneratedAt)}`) : null,
    h("div", { class: "cta" }, h("button", { class: "btn", type: "button", onclick: () => openCatchForm(row, opener) }, "Edit"), h("button", { class: "btn alt", type: "button", onclick: () => confirmDeleteCatch(row) }, "Delete")));
  openSheet(row.species === "other" ? row.otherSpecies : row.speciesName, body, opener);
}
function confirmDeleteCatch(row) {
  const body = h("div", {}, h("p", {}, "Delete this catch from this device?"), h("div", { class: "cta" },
    h("button", { class: "btn alt", type: "button", onclick: () => closeSheet().then(() => toast("Catch kept")) }, "Keep catch"),
    h("button", { class: "btn danger", type: "button", onclick: () => { saveCatches(sortedCatches().filter((x) => x.id !== row.id)); closeSheet().then(() => { render(); toast("Catch deleted"); }); } }, "Delete catch")));
  openSheet("Delete catch?", body);
}
async function exportCatchLog() {
  const csv = catchesToCsv(sortedCatches()), file = new File([csv], "flagler-catch-log.csv", { type: "text/csv" });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share(navigator.canShare?.({ files: [file] }) ? { title: "Flagler Fishing catch log", files: [file] } : { title: "Flagler Fishing catch log", text: csv });
      return;
    }
  } catch (error) { if (error?.name === "AbortError") return; }
  const url = URL.createObjectURL(file), a = h("a", { href: url, download: file.name }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast("CSV exported");
}

/* ---------- sheets ---------- */
let sheet = null;
function openSheet(title, body, opener) {
  interruptTabTransitions();
  closeSheet(true);
  const prev = opener ?? document.activeElement;
  const titleId = "sheet-title";
  const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("div", { class: "sheet-h" }, h("div", { class: "grab", "aria-hidden": "true" }), h("div", { class: "sheet-t" }, h("h2", { id: titleId }, title),
      h("button", { class: "xbtn", type: "button", "aria-label": "Close", "data-fk": "sheet-x", onclick: () => closeSheet() }, s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: PATHS.x }))))),
    h("div", { class: "sheet-b" }, body));
  const scrim = h("div", { class: "scrim", onclick: () => closeSheet() });
  $("sheet-root").replaceChildren(scrim, panel);
  document.body.classList.add("sheet-open");
  $("app").inert = true; $("tabbar").inert = true; $("review").inert = true;
  sheet = { panel, scrim, prev, prevFk: prev?.dataset?.fk };
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && panel.animate) {
    const desktop = matchMedia("(min-width:768px)").matches;
    sheetAnimation = panel.animate(desktop ? [{ opacity: 0, transform: "translate(-50%,-48%) scale(.97)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }] : [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], { duration: 300, easing: motionEase });
    scrim.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
  } else {
    panel.animate?.([{ opacity: .72 }, { opacity: 1 }], { duration: 100, easing: "ease-out" });
    scrim.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: "ease-out" });
  }
  let y0 = null, dy = 0, pointerId = null, samples = [], captured = false;
  const desktopSheet = matchMedia("(min-width:768px)").matches;
  const dragTransform = (distance) => desktopSheet ? `translate(-50%, calc(-50% + ${distance}px))` : `translateY(${distance}px)`;
  panel.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button,input,select,textarea,a,[contenteditable=true]") || e.button != null && e.button !== 0) return;
    const body = panel.querySelector(".sheet-b");
    if (body?.scrollTop > 0 && !e.target.closest(".sheet-h")) return;
    y0 = e.clientY; dy = 0; pointerId = e.pointerId; samples = [{ p: e.clientY, t: performance.now() }]; captured = false; panel.style.touchAction = "none";
    panel.classList.add("drag"); panel.style.willChange = "transform"; sheetAnimation?.cancel();
  });
  panel.addEventListener("pointermove", (e) => {
    if (y0 == null || e.pointerId !== pointerId) return;
    const delta = e.clientY - y0;
    if (!captured && Math.abs(delta) < 7) return;
    dy = delta < -7 ? rubberBand(delta, panel.getBoundingClientRect().height) : Math.max(0, delta);
    if (!captured) { panel.style.touchAction = "none"; panel.setPointerCapture(e.pointerId); captured = true; }
    const now = performance.now(); samples.push({ p: e.clientY, t: now }); samples = samples.filter((sample) => now - sample.t <= 120).slice(-6);
    const progress = Math.max(0, Math.min(1, 1 - dy / panel.getBoundingClientRect().height));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) panel.style.opacity = String(.72 + progress * .28);
    else panel.style.transform = dragTransform(dy);
    if (scrim) scrim.style.opacity = String(progress);
    document.body.style.setProperty("--sheet-progress", String(progress));
    document.body.style.setProperty("--sheet-scale", String(1 - progress * .04));
    document.body.style.setProperty("--sheet-alpha", String(1 - progress * .14));
    e.preventDefault();
  }, { passive: false });
  const rel = (event) => {
    if (y0 == null || event.pointerId !== pointerId) return;
    const velocity = gestureVelocity(samples); y0 = null; pointerId = null;
    panel.classList.remove("drag"); panel.style.willChange = ""; panel.style.touchAction = "";
    if (event.type !== "pointercancel" && (velocity > .5 || dy > panel.getBoundingClientRect().height * .3)) closeSheet(false, { velocity, distance: dy });
    else {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduce ? 100 : gestureDuration(Math.abs(dy), velocity);
      sheetAnimation = reduce
        ? panel.animate?.([{ opacity: Number(panel.style.opacity || 1) }, { opacity: 1 }], { duration, easing: "ease-out" })
        : panel.animate?.([{ transform: dragTransform(dy) }, { transform: desktopSheet ? "translate(-50%,-50%)" : "translateY(0)" }], { duration, easing: motionEase });
      scrim?.animate?.([{ opacity: getComputedStyle(scrim).opacity }, { opacity: 1 }], { duration, easing: "ease-out", fill: "forwards" });
      document.body.style.removeProperty("--sheet-progress");
      document.body.style.removeProperty("--sheet-scale"); document.body.style.removeProperty("--sheet-alpha");
      sheetAnimation?.finished.finally(() => { if (sheet?.panel === panel) { panel.style.transform = ""; panel.style.opacity = ""; if (scrim) scrim.style.opacity = ""; sheetAnimation = null; } }).catch(() => {});
    }
    dy = 0; samples = []; captured = false;
  };
  panel.addEventListener("pointerup", rel); panel.addEventListener("pointercancel", rel);
  panel.addEventListener("keydown", trap);
  panel.querySelector(".xbtn").focus();
}
function trap(e) {
  if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
  if (e.key !== "Tab") return;
  const f = [...sheet.panel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"]), summary')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function closeSheet(silent, dragInfo = null) {
  if (!sheet) return Promise.resolve();
  tick("close"); sheet.observer?.disconnect();
  const current = sheet, { panel, prev, prevFk } = current;
  if (silent) { sheet = null; sheetAnimation?.cancel(); $("sheet-root").replaceChildren(); document.body.classList.remove("sheet-open"); document.body.style.removeProperty("--sheet-progress"); document.body.style.removeProperty("--sheet-scale"); document.body.style.removeProperty("--sheet-alpha"); current.resolveClose?.(); }
  else {
    if (current.closing) return current.closePromise;
    current.closing = true;
    current.closePromise = new Promise((resolve) => { current.resolveClose = resolve; });
    const root = $("sheet-root"), scrim = root.querySelector(".scrim"), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    [panel, scrim].filter(Boolean).forEach((el) => { el.inert = true; el.classList.add("out"); });
    const desktop = matchMedia("(min-width:768px)").matches, computed = getComputedStyle(panel).transform;
    const from = panel.style.transform && panel.style.transform !== "none" ? panel.style.transform : computed && computed !== "none" ? computed : desktop ? "translate(-50%,-50%)" : "translateY(0)";
    sheetAnimation?.cancel();
    const remaining = Math.max(0, panel.getBoundingClientRect().height - Math.max(0, dragInfo?.distance ?? 0));
    const duration = dragInfo ? gestureDuration(remaining, dragInfo.velocity) : 280;
    const animation = panel.animate ? panel.animate(reduce ? [{ opacity: Number(getComputedStyle(panel).opacity) }, { opacity: 0 }] : [{ transform: from }, { transform: desktop ? "translate(-50%,-46%)" : "translateY(100%)" }], { duration: reduce ? 100 : duration, easing: reduce ? "ease-out" : motionEase }) : null;
    scrim?.animate?.([{ opacity: getComputedStyle(scrim).opacity }, { opacity: 0 }], { duration: reduce ? 100 : duration, easing: "ease-out", fill: "forwards" });
    const closeStarted = performance.now(); let minExitTimer;
    const remove = () => {
      const wait = (animation ? (reduce ? 100 : duration) : 0) - (performance.now() - closeStarted);
      if (wait > 0) { clearTimeout(minExitTimer); minExitTimer = setTimeout(remove, wait); return; }
      if (sheet === current) sheet = null; panel.remove(); scrim?.remove(); document.body.classList.remove("sheet-open"); document.body.style.removeProperty("--sheet-progress"); document.body.style.removeProperty("--sheet-scale"); document.body.style.removeProperty("--sheet-alpha"); if (sheetAnimation === animation) sheetAnimation = null; current.resolveClose?.();
    };
    if (animation) {
      const fallback = setTimeout(remove, reduce ? 100 : duration);
      animation.finished.then(() => { clearTimeout(fallback); remove(); }).catch(() => {});
    } else remove();
  }
  $("app").inert = false; $("tabbar").inert = false; $("review").inert = false;
  if (silent) return Promise.resolve();
  const target = prev?.isConnected ? prev : prevFk ? document.querySelector(`[data-fk="${prevFk}"]`) : null;
  (target ?? $("view")).focus?.({ preventScroll: true });
  return current.closePromise;
}
async function shareReport() {
  const url = new URL(location.protocol === "capacitor:" ? "https://cjn119-ui.github.io/flagler-fishing-report/v5/proto/" : location.href); url.hash = location.hash;
  try {
    if (navigator.share) { await navigator.share({ title: document.title, text: "Flagler Fishing conditions and outlook", url: url.href }); return; }
    await navigator.clipboard.writeText(url.href); toast("Report link copied");
  } catch (error) { if (error?.name !== "AbortError") toast("Couldn't share the report link"); }
}
function openMoreSheet(opener) {
  const blocks = [h("section", { class: "block" }, h("h3", {}, "Appearance"),
    segment("Appearance", THEMES, store.get("theme", "auto"), setTheme, "appearance"), h("p", { class: "fine" }, "Auto uses Dark by day and Night after sunset."))];
  if (window.FFNotify) {
    const enabled = store.get("notifications", false);
    blocks.push(h("section", { class: "block notify-block" }, h("h3", {}, "Notifications"),
      h("button", { class: "notify-toggle", type: "button", role: "switch", "aria-checked": String(enabled), onclick: (e) => {
        const next = e.currentTarget.getAttribute("aria-checked") !== "true";
        store.set("notifications", next); e.currentTarget.setAttribute("aria-checked", String(next));
        try { window.FFNotify.toggle?.(next); window.FFNotify.sync?.({ favorites: store.get("favs", []), run: ctx().run }); } catch (error) { console.warn("Flagler notification preference failed", error); }
      } }, h("span", {}, "Notify me about favorite spots"), h("i", {}, enabled ? "On" : "Off")),
      h("p", { class: "fine" }, "Local alerts follow your favorite spots.")));
  }
  blocks.push(h("section", { class: "block" }, h("h3", {}, "Favorites"), h("button", { class: "btn alt", type: "button", onclick: (e) => openFavoritesSheet(e.currentTarget) }, "Manage favorite spots")));
  blocks.push(h("section", { class: "block" }, h("h3", {}, "Share"), h("button", { class: "btn", type: "button", onclick: shareReport }, "Share report")));
  blocks.push(h("section", { class: "block" }, h("h3", {}, "Credits & data"), h("button", { class: "btn alt", type: "button", onclick: (e) => openCreditsSheet(e.currentTarget) }, "Image credits"),
    h("p", { class: "fine" }, "Fishing outlooks use the report's weather, tide, wave, and local history inputs. See Data & Sources on Today for provider and freshness details.")));
  const body = h("div", { class: "more-sheet" }, blocks);
  openSheet("More", body, opener);
}
function openFavoritesSheet(opener) {
  const favs = store.get("favs", []), list = h("ul", { class: "favorite-list" });
  const rows = ACTIVE_SPOTS.filter((spot) => favs.includes(spot.id));
  list.append(...(rows.length ? rows.map((spot) => h("li", { class: "favorite-row" }, spotPhoto(spot.id, "favorite-photo", spot.name), h("b", {}, spot.name),
    h("button", { class: "star", type: "button", "aria-label": `Remove ${spot.name} from favorites`, onclick: () => { store.set("favs", store.get("favs", []).filter((id) => id !== spot.id)); openFavoritesSheet(opener); } }, icon("star")))) : [h("li", { class: "fine" }, "No favorite spots yet. Add one from the Spots tab.")]));
  openSheet("Favorite spots", list, opener);
}
function openCreditsSheet(opener) {
  const list = h("ul", { class: "credits-list" }, imageCredits.map((entry) => {
    const title = entry.generated ? "Illustration generated with OpenAI image_gen" : `${entry.title ?? entry.subject} · ${entry.author ?? "Credit pending"}`;
    const license = entry.generated ? "Generated illustration" : `${entry.license ?? "License"}`;
    return h("li", {}, h("b", {}, entry.subject ?? entry.file), h("span", {}, title), h("small", {}, license),
      entry.source_url && !entry.generated ? h("a", { href: entry.source_url, target: "_blank", rel: "noopener noreferrer" }, "View source") : null);
  }));
  openSheet("Image credits", list, opener);
}
function openSpotSheet(opener) {
  const c = ctx();
  openSheet("Choose a spot", h("div", {}, spotList(c)), opener);
}
function openSpotDetail(id, mode, opener) {
  const c = ctx(), loc = locOf(c.run, id), cat = SPOTS.find((x) => x.id === id);
  if (!cat) return;
  const rec = c.run.scopeViews?.byLocation?.[`${id}:${mode}`]?.recommendation;
  const closure = closureFor(id), month = closure?.reopensEst ? wk(`${closure.reopensEst}-01`, { month: "long", year: "numeric" }) : null;
  const body = h("div", {}, spotPhoto(id,"spot-detail-photo",cat.name,true), closure ? h("section", { class: "closure-detail" }, h("span", { class: "closure-badge" }, closureBadgeText(id)), h("p", {}, closure.reason),
      h("p", {}, `Reopening was estimated for ${month}; check before you go (${closure.reopensNote}).`), h("p", {}, closure.nearbyNote), h("p", { class: "fine" }, "Checked Oct 10, 2026 · ", h("a", { href: closure.source, target: "_blank", rel: "noopener noreferrer" }, "Source"))) : null,
    rec && !isModeClosed(id, mode) ? h("div", {}, h("p", {}, h("span", {class:"vchip", "data-v":rec.verdict},VERDICT_SPOKEN[rec.verdict]), " ", fmtRange(rec.window?.start,rec.window?.end)), h("p",{class:"fine"},(rec.targets??[]).slice(0,3).map((t)=>`${t.name} ${t.suitability}`).join(" · "))) : null,
    h("p", { class: "muted" }, `${loc?.area ?? ""} · ${loc?.modes?.filter((m) => !isModeClosed(id,m)).map((m) => modeDisplay(m,id)).join(" / ") ?? ""}`),
    cat.notes ? h("p", { style: "margin-top:10px" }, cat.notes) : null,
    cat.access?.length ? h("div", { class: "block" }, h("h3", {}, "Access"), h("ul", { style: "margin:0;padding-left:18px" }, cat.access.map((a) => h("li", {}, a)))) : null,
    cat.tips?.length ? h("div", { class: "block" }, h("h3", {}, "Tips"), h("ul", { style: "margin:0;padding-left:18px" }, cat.tips.map((a) => h("li", {}, a)))) : null,
    h("div", { class: "cta" }, st.spot === id ? null : h("button", { class: "btn", type: "button", onclick: () => scope({ spot: id, mode: isModeClosed(id,mode) ? "surf" : mode }) }, "Show this spot on Today"), h("a", { class: "btn alt", href: /Mac|iPhone|iPad/.test(navigator.userAgent) ? `https://maps.apple.com/?daddr=${cat.lat},${cat.lon}` : `https://www.google.com/maps/dir/?api=1&destination=${cat.lat},${cat.lon}` }, "Directions")));
  if (matchMedia("(min-width:900px)").matches && st.tab === "spots") { let pane = document.querySelector(".spot-detail"); if (!pane) { pane = h("section",{class:"card spot-detail"}); document.querySelector(".spots-layout").append(pane); } pane.replaceChildren(h("h2",{},cat.name),body); } else openSheet(cat.name, body, opener);
}
// Live runs keep factors in per-spot details files; load the recommended spot's so "Why this verdict" and the factor table have them.
async function hydrateFactors(run) {
  const rec = run?.recommendation;
  if (!rec?.locationId || run._proto?.factors?.length) return;
  const factors = factorsAt(await fetchRunDetails(run, rec.locationId, rec.mode), rec.driverSpeciesId, rec.window?.start);
  if (!factors.length || D[RICH] !== run) return;
  run._proto = { ...run._proto, factors };
  if (!sheet) render();
}
const factorReasons = (factors) => factors.filter((f) => f.available !== false && (f.effect === "helps" || f.effect === "hurts"))
  .map((f) => ({ effect: f.effect, text: factorLine(f.label, msg(f.humanLabel)) }));
function openSpecies(id, opener) {
  const c = ctx(), sp = spCat(id);
  if (!sp) return;
  const run = c.run;
  const rawFocused = run.scopeViews?.bySpecies?.[id]?.focused ?? null;
  const focused = rawFocused && !isModeClosed(rawFocused.locationId, rawFocused.mode) ? rawFocused : null;
  const cands = openModeRows((run.candidates ?? []).filter((x) => x.speciesId === id), SPOTS);
  const focusedCandidate = focused && cands.find((x) => x.locationId === focused.locationId && x.mode === focused.mode);
  const best = focusedCandidate && (!focusedCandidate.window?.end || Date.parse(focusedCandidate.window.end) > c.now) ? focusedCandidate : bestSpeciesCandidate(cands) ?? bestUpcomingCandidate(cands, c.now);
  const useFocused = !!focused && best?.locationId === focused.locationId && best?.mode === focused.mode;
  const ended = !!best?.window?.end && Date.parse(best.window.end) <= c.now;
  const suit = useFocused ? focused.suitability : best?.suitability ?? null;
  const curve = best?.seasonCurve ?? [];
  const mx = Math.max(0.0001, ...curve.filter((v) => v != null));
  const month = best?.historicalRate?.month;
  const setup = useFocused ? focused.setup : sp.setup, byMode = best && sp.byMode?.[best.mode] ? { ...setup, ...sp.byMode[best.mode] } : setup;
  const place = useFocused ? focused : best && { displayName: locOf(run, best.locationId)?.name, locationId: best.locationId, mode: best.mode, window: best.window };
  const realistic = useFocused || best?.eligibility === "realistic";
  const reason = best && best.eligibility !== "realistic" ? speciesEligibilityLabel(best) : "";
  const monthName = best?.historicalRate?.month ? new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, best.historicalRate.month - 1, 1))) : "Seasonal pattern";
  const body = h("div", { class: "species-detail" }, fishImage(id, "species-detail-photo"),
    h("p", { class: "species-season" }, `${monthName} · ${sp.modes.map(modeLabel).join(" / ")}`),
    h("nav", { class: "species-tabs", "aria-label": "Species details" }, ["Overview", "Techniques", "Bait & Gear", "Best Times"].map((label) => h("button", { type: "button", class: "species-tab", onclick: (e) => {
      const targets = { Overview: "Best for this fish", Techniques: "Use", "Bait & Gear": "Use", "Best Times": "Local history" };
      const section = [...body.querySelectorAll(":scope > .block")].find((x) => x.querySelector("h3")?.textContent === targets[label]);
      section?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      body.querySelectorAll(".species-tab").forEach((b) => b.setAttribute("aria-current", String(b === e.currentTarget)));
    } }, label))),
    sp.alt ? h("p", { class: "muted" }, sp.alt) : null,
    h("div", { class: "kv", style: "margin-top:10px" }, h("span", { class: "stat-big" }, suit ?? "—"), h("span", { class: "muted" }, suit == null ? "No fishing window in this run" : `Suitability${best?.band ? ` · ${best.band}` : ""}`), sp.bycatch ? h("span", { class: "tag" }, "Bycatch") : null),
    !realistic && reason ? h("p", { class: "fine eligibility" }, reason) : null,
    best?.historicalRate ? h("p", { class: "fine trip-rate" }, speciesTripRate(best)) : null,
    place?.displayName ? h("div", { class: "block" }, h("h3", {}, "Best place and time"), h("p", { style: "font-weight:600" }, place.displayName, " ", h("span", { class: "mchip" }, modeIcon(place.mode), modeLabel(place.mode))), place.window ? h("p", { class: "muted" }, fmtRange(place.window.start, place.window.end)) : null) : null,
    curve.length === 12 ? h("div", { class: "block" }, h("h3", {}, "Season by month"),
      h("div", { class: "season", role: "img", "aria-label": `Seasonal pattern by month, ${sp.name}. Strongest ${MONTHS.map((_, i) => i).filter((i) => curve[i] === Math.max(...curve.filter((v) => v != null)))?.map((i) => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, i, 1)))).join(", ")}.` },
        curve.map((v, i) => h("div", { class: `m${i + 1 === month ? " cur" : ""}${v == null ? " nul" : ""}` }, h("div", { class: "tr" }, v == null ? null : h("i", { style: `height:${Math.max(4, (v / mx) * 100)}%` })), h("span", { class: "l", "aria-hidden": "true" }, MONTHS[i])))),
      h("p", { class: "fine" }, "Regional share of surveyed trips that caught it, by month (relative bars). Today's month is outlined.")) : null,
    best?.historicalRate ? h("div", { class: "block" }, h("h3", {}, "Local history"), h("p", { style: "font-size:var(--fs-body)" }, formatHistoricalRate(best.historicalRate, best.mode))) : null,
    h("div", { class: "block" }, h("h3", {}, "Setup"), h("dl", {},
      byMode.where ? h("div", {}, h("dt", {}, "Where"), h("dd", {}, byMode.where)) : null,
      byMode.bait?.length ? h("div", {}, h("dt", {}, "Bait"), h("dd", {}, h("ul", {}, byMode.bait.map((b) => h("li", {}, b))))) : null,
      byMode.lures?.length ? h("div", {}, h("dt", {}, "Lures"), h("dd", {}, h("ul", {}, byMode.lures.map((b) => h("li", {}, b))))) : null,
      byMode.rig ? h("div", {}, h("dt", {}, "Rig"), h("dd", {}, byMode.rig)) : null,
      sp.tip ? h("div", {}, h("dt", {}, "Tip"), h("dd", {}, sp.tip)) : null), h("p", { class: "fine" }, "Check current FWC rules before you go.")),
    h("div", { class: "cta" },
      sp.bycatch ? h("p", { class: "fine" }, "Bycatch species are never a target, so there is no Target this.") :
      st.species === id ? h("button", { class: "btn alt", type: "button", onclick: () => scope({ spot: st.spot, mode: st.mode, tab: st.tab }) }, "Stop targeting") :
      h("button", { class: "btn", type: "button", disabled: focused ? null : true, "aria-describedby": focused ? null : "tt-why", onclick: () => scope({ spot: null, species: id }) }, `Target this: ${sp.name}`),
      !sp.bycatch && !focused ? h("p", { class: "fine", id: "tt-why" }, `No usable window for ${sp.name} in this run, so it can't re-rank Today.`) : null));
  const blocks = [...body.querySelectorAll(":scope > .block")];
  const setupBlock = blocks.find((x) => x.querySelector("h3")?.textContent === "Setup");
  const historyBlock = blocks.find((x) => x.querySelector("h3")?.textContent === "Local history");
  const seasonBlock = blocks.find((x) => x.querySelector("h3")?.textContent === "Season by month");
  const placeBlock = blocks.find((x) => x.querySelector("h3")?.textContent === "Best place and time");
  const actionHost = body.querySelector(":scope > .cta"); const action = actionHost?.querySelector("button");
  if (action) { action.textContent = st.species === id ? "Stop targeting" : "Target this"; body.querySelector(".kv").append(action); }
  if(placeBlock) { const verdict = VERDICT_SPOKEN[place.verdict]; placeBlock.replaceChildren(h("h3",{},"Best for this fish"),h("button",{class:"bet",type:"button",onclick:()=>scope({spot:place.locationId ?? best?.locationId,mode:place.mode})},h("span",{},place.displayName," · ",fmtRange(place.window?.start,place.window?.end),ended?" · ended":""),verdict ? h("span",{class:"vchip","data-v":place.verdict},verdict) : null)); }
  const reasons = (useFocused ? focused?.why ?? [] : best?.why ?? []).filter((x)=>!/unavailable|thin|buoy|stale|missing/i.test(x.code??""));
  const why = h("div",{class:"block"},h("h3",{},"Why now"),h("ul",{class:"whys"},[...reasons.filter((x)=>x.effect==="helps").slice(0,2),...reasons.filter((x)=>x.effect==="hurts").slice(0,1)].map((x)=>h("li",{},effectMark(x.effect),msg(x)))));
  if(setupBlock) { setupBlock.querySelector("h3").textContent="Use"; setupBlock.querySelector(".fine")?.remove(); }
  if(seasonBlock) { seasonBlock.querySelector("h3").textContent="Local history"; seasonBlock.querySelector(".fine").textContent="Share of surveyed trips that caught it, by month"; if(historyBlock) { seasonBlock.append(...[...historyBlock.children].slice(1)); historyBlock.remove(); } }
  if (!why.querySelector("li")) {
    const note = h("p",{class:"fine"},"Loading conditions…"); why.append(note);
    const at = best?.window?.start ?? best?.at ?? c.now;
    fetchRunDetails(run, best?.locationId, best?.mode).then((details) => {
      const rows = factorReasons(factorsAt(details, id, at));
      const pick = [...rows.filter((x) => x.effect === "helps").slice(0, 2), ...rows.filter((x) => x.effect === "hurts").slice(0, 1)];
      if (!pick.length) { note.textContent = "Condition details unavailable for this fish."; return; }
      note.replaceWith(h("ul",{class:"whys"},pick.map((x) => h("li",{},effectMark(x.effect),h("span",{},x.text)))));
    });
  }
  body.append(why); if(setupBlock) body.append(setupBlock); if(seasonBlock) body.append(seasonBlock); else if(historyBlock) body.append(historyBlock);
  body.append(h("a",{class:"btn alt",href:"https://myfwc.com/fishing/saltwater/recreational/",target:"_blank",rel:"noopener"},"Check current FWC rules")); actionHost?.remove();
  if(matchMedia("(min-width:900px)").matches && st.tab === "species") { const browser = document.querySelector(".species-browser"); let layout=browser.parentElement.querySelector(".species-layout"); if(!layout) { layout=h("div",{class:"species-layout"}); browser.replaceWith(layout); layout.append(browser); } let pane=layout.querySelector(".species-pane"); if(!pane) { pane=h("section",{class:"card species-pane"});layout.append(pane); } pane.replaceChildren(h("h2",{},sp.name),body); }
  else { openSheet(sp.name, body, opener); if(action) { const footer=h("div",{class:"sheet-f",hidden:true},h("button",{class:action.className,type:"button",disabled:action.disabled||null,onclick:()=>action.click()},action.textContent));sheet.panel.append(footer);sheet.observer=new IntersectionObserver(([entry])=>{footer.hidden=entry.isIntersecting;},{root:sheet.panel.querySelector(".sheet-b")});sheet.observer.observe(action); } }

}

/* ---------- toast, review ---------- */
let toastTimer;
function toast(m) {
  const t = $("toast"), success = /^(Catch saved|Catch updated)$/.test(m);
  t.replaceChildren(...(success ? [icon("check", "toast-check")] : []), h("span", {}, m));
  t.classList.toggle("success", success); t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}
function setTheme(t) {
  if (!["auto", "dark", "night", "light"].includes(t)) return;
  store.set("theme", t);
  const p = new URLSearchParams(location.hash.slice(1)); p.delete("theme"); history.replaceState(null, "", `#${p}`);
  applyThemePreference(t, null);
  document.querySelectorAll('[data-fk^="Appearance-"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fk === `Appearance-${t}`)));
  syncReview();
}
function syncReview() {
  document.querySelectorAll("#review-states button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === st.state)));
  const t = store.get("theme", "auto");
  document.querySelectorAll("#review-themes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === t)));
}
async function setState(id) { const def = STATES.find((x) => x.id === id); await load(def.file); st.state = id; st.tab = "today"; st.h = "today"; st.spot = null; st.mode = null; st.species = null; st.t = null; lastSpoken = ""; closeSheet(true); render({ resetScroll: true }); }
function initReview() {
  $("review").hidden = !["127.0.0.1","localhost"].includes(location.hostname) && new URLSearchParams(location.hash.slice(1)).get("review") !== "1";
  $("review-panel").querySelector(".eyebrow").textContent = "Sample states (review only)";
  const sl = $("review-states");
  for (const d of STATES) sl.append(h("button", { type: "button", "data-id": d.id, "aria-pressed": "false", onclick: () => setState(d.id) }, d.label));
  const tl = $("review-themes");
  for (const [id, label] of THEMES) tl.append(h("button", { type: "button", "data-id": id, "aria-pressed": "false", onclick: () => setTheme(id) }, label));
  const btn = $("review-btn"), panel = $("review-panel");
  btn.addEventListener("click", () => { const open = panel.hidden; panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden && !sheet) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
}

/* ---------- init ---------- */
async function init() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  $("home").addEventListener("click", () => go("today"));
  $("spot-pill").addEventListener("click", (e) => openSpotSheet(e.currentTarget));
  $("more").addEventListener("click", (e) => openMoreSheet(e.currentTarget));
  document.addEventListener("ffmap:select", (event) => {
    const id = event.id ?? event.detail?.id;  // Capacitor puts native event data on the event itself
    if (!locOf(ctx().run, id)) return;
    st.spot = id; st.species = null; st.t = null;
    if (st.mode) st.mode = coerceMode(ctx().run, id, st.mode);
    render();
  });
  const tabs = document.querySelector(".tabs"), tabButtons = [...document.querySelectorAll(".tab")];
  let swipePreview = null, swipePreviewTab = null;
  const makeTabPreview = (tab) => {
    const previous = st.tab, previousHost = listHost; let nodes;
    try {
      st.tab = tab;
      const c = ctx(); nodes = tab === "today" ? todayView(c) : tab === "spots" ? spotsView(c) : tab === "species" ? speciesView(c) : tab === "plan" ? planView(c) : logView(c);
      const banner = $("banner-slot")?.cloneNode(true); banner?.removeAttribute("id");  // the banner is the same on every tab
      nodes = [h("div", { class: "ctl" }, ...ctlNodes(c)), banner, h("div", { class: "peek-view" }, ...nodes)].filter(Boolean);
    } finally { st.tab = previous; listHost = previousHost; }
    const preview = h("div", { class: "tab-peek", "aria-hidden": "true" }, ...nodes);
    preview.inert = true; preview.style.transform = "translateX(110vw)"; document.body.append(preview); return preview;
  };
  const tabIndexAt = (x) => Math.max(0, Math.min(tabButtons.length - 1, Math.floor((x - tabs.getBoundingClientRect().left) / (tabs.getBoundingClientRect().width / tabButtons.length))));
  let tabSuppressClick = false;
  tabs.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const index = tabIndexAt(event.clientX); tabDrag = { pointerId: event.pointerId, index, startX: event.clientX, moved: false };
  });
  tabs.addEventListener("pointermove", (event) => {
    if (!tabDrag || event.pointerId !== tabDrag.pointerId) return;
    const index = tabIndexAt(event.clientX); tabDrag.moved ||= Math.abs(event.clientX - tabDrag.startX) > 10;
    if (tabDrag.moved && !tabs.hasPointerCapture(event.pointerId)) { tabs.setPointerCapture(event.pointerId); tabs.classList.add("dragging"); }
    const box = tabs.getBoundingClientRect(), step = box.width / tabButtons.length;
    if (tabDrag.moved) {
      const rawIndex = (event.clientX - box.left) / step, maxIndex = tabButtons.length - 1;
      const index = rawIndex < 0 ? rubberBand(rawIndex * step, step) / step : rawIndex > maxIndex ? maxIndex + rubberBand((rawIndex - maxIndex) * step, step) / step : rawIndex;
      tabs.style.setProperty("--tab-i", index);
    }
    if (index !== tabDrag.index) tabDrag.index = index;
  });
  const finishTabDrag = (event) => {
    if (!tabDrag || (event && event.pointerId !== tabDrag.pointerId)) return;
    const target = tabButtons[tabDrag.index]?.dataset.tab, moved = tabDrag.moved; tabDrag = null;
    tabs.classList.remove("dragging");
    tabSuppressClick = moved;
    if (moved && target) { event?.preventDefault(); go(target); }
    if (!moved) tabs.style.removeProperty("--tab-i");
  };
  tabs.addEventListener("pointerup", finishTabDrag); tabs.addEventListener("pointercancel", () => { tabDrag = null; tabSuppressClick = false; tabs.classList.remove("dragging"); tabs.style.removeProperty("--tab-i"); });
  tabs.addEventListener("click", (event) => { if (tabSuppressClick) { tabSuppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true });
  $("refresh").addEventListener("click", () => {
    const chip = $("fresh"), rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    chip.replaceChildren(rm ? "" : h("span", { class: "spin" }), "Updating…");
    refreshLiveData().then((result) => { refreshError = ""; if (result.changed) render(); else { renderHeader(ctx()); renderBanner(ctx()); } tick("refresh"); }).catch(error => { console.warn("V5 live refresh failed", error); refreshError = `Couldn't refresh — showing ${fmtTime(ctx().run.generatedAt)} data`; render(); }).finally(() => { $("pull-refresh")?.remove(); });
  });
  if (matchMedia("(display-mode: standalone)").matches) document.body.style.overscrollBehaviorY = "contain";
  // Pull-to-refresh only engages on a clearly vertical pull, so it never fights a sideways tab swipe (both move <main>).
  let pullStart = null, pullX = 0, pullEngaged = false, pulled = false, pullDistance = 0;
  document.addEventListener("touchstart", (e) => { pullStart = st.tab === "today" && scrollY === 0 && !sheet ? e.touches[0].clientY : null; pullX = e.touches[0].clientX; pullEngaged = false; pullDistance = 0; pulled = false; }, {passive:true});
  document.addEventListener("touchmove", (e) => {
    if (pullStart == null || cOffline()) return;
    const distance = Math.max(0, e.touches[0].clientY - pullStart), sideways = Math.abs(e.touches[0].clientX - pullX);
    if (!pullEngaged) {
      if (sideways > 10 && sideways >= distance) { pullStart = null; return; }  // a swipe, not a pull
      if (distance < 12 || distance < sideways * 1.5) return;
      pullEngaged = true;
    }
    if (!distance) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    pullDistance = Math.min(92, distance * .48);
    if (distance > 18) {
      if (reduce) $("main").style.opacity = String(1 - Math.min(.2, pullDistance / 460));
      else $("main").style.transform = `translateY(${pullDistance}px)`;
    }
    if (distance > 64) { pulled = true; let indicator = $("pull-refresh"); if (!indicator) { indicator = h("div", { id: "pull-refresh", role: "status" }, h("span", { class: "pull-spinner", "aria-hidden": "true" }), h("span", {}, "Release to refresh")); $("ctl").append(indicator); } indicator.style.setProperty("--pull-progress", Math.min(1, distance / 92)); }
  }, {passive:true});
  const finishPull = (event) => {
    if (!pullEngaged) { pullStart = null; return; }  // leave <main> alone: a swipe may be settling it
    pullEngaged = false;
    const main = $("main"), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce && main.style.opacity) main.animate?.([{ opacity: Number(main.style.opacity) }, { opacity: 1 }], { duration: 100, easing: "ease-out" }).finished.finally(() => { main.style.opacity = ""; }).catch(() => {});
    else if (main.animate && main.style.transform) main.animate([{ transform: main.style.transform }, { transform: "translateY(0)" }], { duration: 240, easing: motionEase }).finished.finally(() => { main.style.transform = ""; }).catch(() => {});
    if (pulled && event.type === "touchend") $("refresh").click();
    $("pull-refresh")?.remove(); pullStart=null; pulled=false; pullDistance=0;
  };
  document.addEventListener("touchend", finishPull);
  document.addEventListener("touchcancel", finishPull);
  const cOffline = () => ctx().offline;
  const nav = $("tabbar"), wide = matchMedia("(min-width:900px)"); const placeNav = () => { if(wide.matches) document.querySelector(".bar").append(nav); else document.body.insertBefore(nav,$("sheet-root")); }; placeNav(); wide.addEventListener("change",placeNav);
  initReview();
  $("view").replaceChildren(h("div",{class:"card skeleton-hero"},h("div",{class:"skel skeleton-ring"}),h("div",{},...[60,90,40].map((w)=>h("div",{class:"skel skeleton-line",style:`width:${w}%`}))),h("p",{class:"muted"},"Reading the water…")),h("div",{class:"card"},...[1,2,3].map(()=>h("div",{class:"skel skeleton-row"}))));
  try {
    const first = new URLSearchParams(location.hash.slice(1));
    const wanted = STATES.find((x) => x.id === first.get("state"));
    const cached = readCachedProtoRuns(safeStorage());
    if (cached) {
      D[RICH] = cached.today; D[TOMORROW] = cached.tomorrow;
      hydrateFactors(D[RICH]);
      horizonSource.today = horizonSource.tomorrow = "cached";
      horizonOffline.today = horizonOffline.tomorrow = navigator.onLine === false;
      dataSource = "cached"; dataOffline = navigator.onLine === false;
    }
    const creditsPromise = load("img/CREDITS.json");
    const samplesPromise = cached ? null : Promise.all([load(RICH_SAMPLE), load(TOMORROW_SAMPLE), ...(wanted ? [load(wanted.file)] : [])]);
    const [credits] = await Promise.all([creditsPromise, samplesPromise ?? Promise.resolve()]);
    if (!cached) {
      D[RICH] = D[RICH_SAMPLE]; D[TOMORROW] = D[TOMORROW_SAMPLE];
      horizonSource.today = horizonSource.tomorrow = "sample";
      horizonOffline.today = horizonOffline.tomorrow = navigator.onLine === false;
      dataOffline = navigator.onLine === false;
    }
    imageCredits = Array.isArray(credits) ? credits.filter((entry) => !entry.file.startsWith("fish/ref/")) : [];
    const p = readHash();
    if (!location.hash) { const saved = store.get("spot", null); if (saved && locOf(D[RICH], saved.spot)) { st.spot = saved.spot; st.mode = coerceMode(D[RICH], saved.spot, saved.mode); } }
    refreshInProgress = navigator.onLine !== false;
    render({ resetScroll: true });
    if (p.get("t") && st.tab === "today") render();
    let renderedOnToday = false;
    refreshLiveData({ onToday: ({ changed }) => {
      renderedOnToday = changed;
      if (changed) render();
      else { renderHeader(ctx()); renderBanner(ctx()); }
    } }).then((result) => {
      if (result.changed && !renderedOnToday && st.h === "tomorrow") render();
      else if (!renderedOnToday) { renderHeader(ctx()); renderBanner(ctx()); }
    }).catch((error) => {
      console.warn("V5 initial refresh failed", error);
      dataOffline = navigator.onLine === false || !cached;
      horizonOffline.today = dataOffline;
      refreshInProgress = false;
      if (!cached) dataSource = horizonSource.today = "sample";
      render();
    });
  } catch (e) {
    console.error(e);
    $("view").replaceChildren(h("div", { class: "card" }, h("h2", {}, "Couldn't read the report"), h("p", { class: "muted" }, "Something went wrong reading the report. Try again, or check back in a few minutes."),
      h("div", { class: "cta" }, h("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Try again"))));
    $("view").setAttribute("aria-busy", "false");
  }
  addEventListener("focus", () => { refreshLiveData().then(() => render()).catch(error => console.warn("V5 focus refresh failed", error)); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { syncTheme(); refreshLiveData().then(() => render()).catch(error => console.warn("V5 visibility refresh failed", error)); } });
  addEventListener("focus", () => syncTheme());
  addEventListener("online", () => { syncTheme(); refreshLiveData().then(() => render()).catch(error => console.warn("V5 online refresh failed", error)); });
  addEventListener("offline", () => { dataOffline = true; syncTheme(); refreshLiveData().then(() => render()).catch(error => console.warn("V5 offline restore failed", error)); });
  let clockKey = "";
  const clockRenderKey = () => { const c = ctx(); return `${ageText(Math.max(0, Math.round((Date.now() - Date.parse(c.run.generatedAt)) / 60000)))}|${freshness(c.run, c.now).level}|${windowPhase(c.rec.window, c.now)}|${autoTheme()}`; };
  let dataKey = `${D[RICH]?.id}|${D[TOMORROW]?.id}|${dataSource}|${dataOffline}`;
  setInterval(() => { syncTheme(); refreshLiveData().then(() => { const next = `${D[RICH]?.id}|${D[TOMORROW]?.id}|${dataSource}|${dataOffline}`; if (next !== dataKey) { dataKey = next; render(); } }).catch(error => console.warn("V5 scheduled refresh failed", error)); }, 5 * 60 * 1000);
  setInterval(() => { const next = clockRenderKey(); if (next !== clockKey) { clockKey = next; render(); } }, 60 * 1000);
  addEventListener("hashchange", async () => { closeSheet(); const p = new URLSearchParams(location.hash.slice(1)); const d = STATES.find((x) => x.id === p.get("state")); if (d) await load(d.file); readHash(); render(); });
  let swipe = null, lastScrollAt = 0;
  // A drag that starts while the page is still scrolling (momentum) is a scroll, not a tab swipe.
  addEventListener("scroll", () => { lastScrollAt = performance.now(); }, { passive: true });
  const previewCache = new Map();
  const clearSwipePreviews = () => { for (const preview of previewCache.values()) preview.remove(); previewCache.clear(); };
  document.addEventListener("v5:interrupt-tab-gesture", () => { swipe = null; swipePreview?.remove(); swipePreview = null; swipePreviewTab = null; clearSwipePreviews(); });
  const prepareSwipePreview = (tab) => {
    if (previewCache.has(tab)) { const preview = previewCache.get(tab); document.body.append(preview); return preview; }
    // Line the preview up with where the real tab will render, so nothing snaps when the swipe commits: it mirrors
    // <main> (controls row + page) from main's untransformed content edge, at the target tab's saved scroll, under the sticky header.
    const main = $("main"), preview = makeTabPreview(tab), box = main.getBoundingClientRect(), cs = getComputedStyle(main);
    const contentTop = box.top + scrollY + (parseFloat(cs.paddingTop) || 0) - (session.scroll[tab] ?? 0);
    const clipTop = Math.max(0, document.querySelector(".bar")?.getBoundingClientRect().bottom ?? 0);
    preview.style.top = `${Math.max(clipTop, contentTop)}px`;
    preview.style.bottom = `${innerHeight - $("tabbar").getBoundingClientRect().top}px`;
    preview.style.left = `${box.left + (parseFloat(cs.paddingLeft) || 0)}px`; preview.style.width = `${main.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)}px`;
    preview.style.padding = "0";
    preview.scrollTop = Math.max(0, clipTop - contentTop);
    previewCache.set(tab, preview);
    return preview;
  };
  const scrollsHorizontally = (target) => { for (let el = target; el && el !== $("view"); el = el.parentElement) { const style = getComputedStyle(el); if (el.matches(".scrub,.seg,input,select,textarea,[contenteditable=true],.target-species-scroll,.other-spots-scroll,.species-carousel,.plan-day-chips,.hourly-scroll,.species-tabs") || /(auto|scroll)/.test(`${style.overflowX} ${style.overflow}`) && el.scrollWidth > el.clientWidth + 1) return true; } return false; };
  document.addEventListener("touchstart", (e) => {
    const t = e.touches[0], target = e.target;
    if (!$("view").contains(target) || sheet || t.clientX < 20 || t.clientX > innerWidth - 20 || performance.now() - lastScrollAt < 150 || scrollsHorizontally(target)) { swipe = null; return; }
    if (tabSettleAnimation || document.querySelector(".tab-peek")) interruptTabTransitions();
    swipe = { x: t.clientX, y: t.clientY, dx: 0, dy: 0, scrollY, view: $("main") /* controls row and page move together */, samples: [{ p: t.clientX, t: performance.now() }] };
    clearSwipePreviews();
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!swipe) return;
    const t = e.touches[0], now = performance.now(); swipe.dx = t.clientX - swipe.x; swipe.dy = t.clientY - swipe.y;
    swipe.samples.push({ p: t.clientX, t: now }); swipe.samples = swipe.samples.filter((sample) => now - sample.t <= 120).slice(-6);
    if (!swipe.horizontal && (Math.abs(swipe.dy) > 10 && Math.abs(swipe.dy) >= Math.abs(swipe.dx) || Math.abs(scrollY - swipe.scrollY) > 2)) { swipe = null; clearSwipePreviews(); return; }
    if (swipe.horizontal || Math.abs(swipe.dx) > 14 && Math.abs(swipe.dx) > Math.abs(swipe.dy) * 1.8) {
      // Start following from where the swipe was recognised, so the page doesn't leap by the detection slop.
      if (!swipe.horizontal) { const sign = Math.sign(swipe.dx); swipe.x = t.clientX - sign; swipe.dx = sign; }  // keep the direction so the right preview is built
      swipe.horizontal = true;
      const i = TAB_ORDER.indexOf(st.tab), next = TAB_ORDER[i + (swipe.dx < 0 ? 1 : -1)], atEdge = !next, dx = atEdge ? rubberBand(swipe.dx, innerWidth) : swipe.dx;
      if (!swipe.interrupted) {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(swipe.view).transform);
        const carriedX = Number.isFinite(matrix.m41) ? matrix.m41 : 0;
        tabSettleAnimation?.cancel(); tabSettleAnimation = null;
        swipe.view.style.transform = carriedX ? `translateX(${carriedX}px)` : "";
        swipe.interrupted = true;
      }
      tabs.classList.add("content-drag");
      const rawIndex = i - swipe.dx / innerWidth, maxIndex = TAB_ORDER.length - 1, tabWidth = tabs.getBoundingClientRect().width / TAB_ORDER.length;
      const indicatorIndex = rawIndex < 0 ? rubberBand(rawIndex * tabWidth, tabWidth) / tabWidth : rawIndex > maxIndex ? maxIndex + rubberBand((rawIndex - maxIndex) * tabWidth, tabWidth) / tabWidth : rawIndex;
      tabs.style.setProperty("--tab-i", indicatorIndex);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        swipe.view.style.willChange = "transform"; swipe.view.style.transform = `translateX(${dx}px)`;
        if (next && next !== swipePreviewTab) { swipePreview?.remove(); swipePreview = prepareSwipePreview(next); swipePreviewTab = next; if (swipePreview) { swipePreview.style.zIndex = "19"; swipePreview.style.transform = `translateX(${(swipe.dx < 0 ? 1 : -1) * innerWidth + swipe.dx}px)`; } }
        if (swipePreview) swipePreview.style.transform = `translateX(${(swipe.dx < 0 ? 1 : -1) * innerWidth + swipe.dx}px)`;
        if (!next) { swipePreview?.remove(); swipePreview = null; swipePreviewTab = null; }
      }
      e.preventDefault();
    }
  }, { passive: false });
  const finishSwipe = (event) => {
    if (!swipe) return;
    const { dx, dy, view, samples } = swipe; swipe = null;
    const velocity = gestureVelocity(samples), projected = dx + velocity * 200;
    const currentIndex = TAB_ORDER.indexOf(st.tab), candidate = TAB_ORDER[currentIndex + (projected < 0 ? 1 : -1)];
    const commit = event.type !== "touchcancel" && !!candidate && Math.sign(projected) === Math.sign(dx) && Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(projected) >= Math.max(64, innerWidth * 0.18);
    if (!commit) {
      swipePreview?.remove(); swipePreview = null; swipePreviewTab = null; clearSwipePreviews(); tabs.classList.remove("content-drag"); tabs.style.removeProperty("--tab-i");
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const from = view.style.transform || "translateX(0)";
      if (view.animate && from !== "translateX(0)") {
        const animation = view.animate(reduce ? [{ opacity: .72 }, { opacity: 1 }] : [{ transform: from }, { transform: "translateX(0)" }], { duration: reduce ? 100 : gestureDuration(Math.abs(dx), velocity), easing: motionEase });
        animation.finished.finally(() => { view.style.transform = ""; view.style.willChange = ""; }).catch(() => {});
      } else { view.style.transform = ""; view.style.willChange = ""; }
      return;
    }
    const next = candidate, targetIndex = TAB_ORDER.indexOf(candidate);
    const direction = targetIndex > currentIndex ? -1 : 1;
    if (swipePreviewTab !== next) {
      swipePreview?.remove(); swipePreview = prepareSwipePreview(next); swipePreviewTab = next;
    }
    if (swipePreview) { swipePreview.style.zIndex = "19"; swipePreview.style.transform = `translateX(${-direction * innerWidth + dx}px)`; }
    animateTabPreview(swipePreview, next);
    tabs.classList.remove("content-drag"); tabs.style.setProperty("--tab-i", targetIndex);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const remaining = Math.max(0, innerWidth - Math.abs(dx)), duration = reduce ? 100 : gestureDuration(remaining, velocity);
    const animations = [];
    if (!reduce && view.animate && view.style.transform) animations.push(view.animate([{ transform: view.style.transform }, { transform: `translateX(${direction * innerWidth}px)` }], { duration, easing: motionEase }).finished.catch(() => {}));
    if (!reduce && swipePreview?.animate) animations.push(swipePreview.animate([{ transform: `translateX(${-direction * innerWidth + dx}px)` }, { transform: "translateX(0)" }], { duration, easing: motionEase }).finished.catch(() => {}));
    if (reduce && view.animate) animations.push(view.animate([{ opacity: .72 }, { opacity: 1 }], { duration, easing: "ease-out" }).finished.catch(() => {}));
    const transition = ++tabTransitionEpoch;
    Promise.all(animations).finally(() => {
      if (transition !== tabTransitionEpoch) { swipePreview?.remove(); swipePreview = null; swipePreviewTab = null; clearSwipePreviews(); view.style.transform = ""; view.style.willChange = ""; return; }
      go(next, { swipe: true });
      swipePreview?.remove(); swipePreview = null; swipePreviewTab = null; clearSwipePreviews();
      view.style.transform = ""; view.style.willChange = "";
      tabs.classList.remove("content-drag"); tabs.style.removeProperty("--tab-i");
    });
  };
  document.addEventListener("touchend", finishSwipe, { passive: true }); document.addEventListener("touchcancel", finishSwipe, { passive: true });
}
init();
