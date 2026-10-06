// V5 app prototype. Renders ONLY from contract-shaped PredictionRun JSON (samples in this folder). No scoring logic here.
// Numbers and sentences come from the JSON and from ../engine/copy.js (pure formatters); species/spot catalogs
// (../species.js, ../spots.js) supply names, default setup and access notes. Everything else is layout and state.
import { formatWhenLabel, formatWindowStatus, formatHistoricalRate, formatConfidence, formatCopyMessage, formatVerdictLine } from "../engine/copy.js";
import { SPECIES } from "../species.js";
import { SPOTS } from "../spots.js";

const TZ = "America/New_York";
const RICH = "sample-rich.json", TOMORROW = "sample-rich-tomorrow.json";
const STATES = [
  { id: "maybe",   label: "Live sample (MAYBE)", file: RICH, live: true, nowOffsetMin: 5 },
  { id: "go",      label: "Perfect day (GO)",    file: "sample-go.json",      nowOffsetMin: 30 },
  { id: "skip",    label: "SKIP",                file: "sample-skip.json",    nowOffsetMin: 10 },
  { id: "stale",   label: "Stale",               file: "sample-stale.json",   nowIso: "2026-10-05T12:05:00.000Z" },
  { id: "offline", label: "Offline, last known", file: "sample-go.json",      nowOffsetMin: 38, offline: true },
  { id: "partial", label: "Partial data",        file: "sample-partial.json", nowOffsetMin: 20 },
];
const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
const AGING_MIN = 90, STALE_MIN = 360;
const TIER = { GO: 0, MAYBE: 1, SKIP: 2 };
const LEVEL = { GO: 0, MAYBE: 1, SKIP: 2 };
const VERDICT_SPOKEN = { GO: "Go", MAYBE: "Maybe", SKIP: "Skip" };
const DELTA = { better: "Better tomorrow", similar: "About the same", worse: "Rougher tomorrow" };
const SHORT_REASON = { provisionalGoThreshold: "Strong candidate; GO threshold still provisional." }; // taste Q5 (engine/copy.js owns the long form)
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const BAR_H = { GO: 94, MAYBE: 62, SKIP: 28, Promising: 78, Mixed: 52, Tough: 26 }; // decorative height for the label, not a score

/* ---------- state ---------- */
const st = { tab: "today", h: "today", spot: null, mode: null, species: null, t: null, state: "maybe", day: 0, f: "all" };
const session = { history: false, factors: false, use: false, conf: false, sources: false, hint: true, near: null, scroll: {} };
const D = {};            // loaded JSON by file
let lastSpoken = "";

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

/* ---------- formatting (display only) ---------- */
const fmtTime = (d) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d)).replace(":00", "");
const ampm = (t) => t.match(/\s([AP]M)$/)?.[1];
const fmtRange = (a, b) => { const x = fmtTime(a), y = fmtTime(b); return `${ampm(x) && ampm(x) === ampm(y) ? x.replace(/\s[AP]M$/, "") : x}–${y}`; };
const localParts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(d)).map((p) => [p.type, p.value]));
const localHour = (d) => Number(localParts(d).hour) % 24;
const localMin = (d) => Number(localParts(d).minute);
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
const partWord = (d) => { const hr = localHour(d); return hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"; };
const ageText = (min) => min < 60 ? `${min} min ago` : `${Math.round(min / 60)} hr${Math.round(min / 60) === 1 ? "" : "s"} ago`;
const modeLabel = (m) => ({ surf: "Surf", pier: "Pier", inshore: "Inshore" }[m] ?? m);
const cap = (x) => x ? x[0].toUpperCase() + x.slice(1) : x;
const spName = (id) => SPECIES.find((x) => x.id === id)?.name ?? id;
const spCat = (id) => SPECIES.find((x) => x.id === id);
const wk = (date, o) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o }).format(new Date(`${date}T16:00:00Z`));
const msg = formatCopyMessage;

function freshness(run, now) {
  const age = Math.max(0, Math.round((now - Date.parse(run.generatedAt)) / 60000));
  const pastValid = now > Date.parse(run.validTo);
  const level = age > STALE_MIN || pastValid ? "stale" : age >= AGING_MIN ? "aging" : "fresh";
  return { age, level };
}
function relDay(iso, now) { const k = dayKey(iso), n = dayKey(now); return k === n ? "today" : k === dayKey(now - 86400000) ? "yesterday" : "earlier"; }
const haversine = (a, b) => { const R = 3958.8, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

/* ---------- data + context ---------- */
async function load(file) {
  if (D[file]) return D[file];
  const res = await fetch(file, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return (D[file] = await res.json());
}
const stateDef = () => STATES.find((x) => x.id === st.state) ?? STATES[0];
function locOf(run, id) { return run.locations?.find((l) => l.id === id); }
function modesOf(run, id) { return locOf(run, id)?.modes ?? []; }
function bestModeRec(run, id) {
  const cands = modesOf(run, id).map((m) => run.scopeViews?.byLocation?.[`${id}:${m}`]?.recommendation).filter(Boolean);
  return cands.sort((a, b) => TIER[a.verdict] - TIER[b.verdict] || b.suitability - a.suitability)[0] ?? null;
}
function ctx() {
  const def = stateDef(), rich = D[RICH], tom = D[TOMORROW];
  const scoped = !!(st.spot || st.species);
  const override = !def.live && !scoped && st.h === "today";
  const base = override ? D[def.file] : rich;
  const run = st.h === "tomorrow" ? tom : base;
  const now = override ? (def.nowIso ? Date.parse(def.nowIso) : Date.parse(base.generatedAt) + (def.nowOffsetMin ?? 0) * 60000)
                       : Date.parse(rich.generatedAt) + (def.nowOffsetMin ?? 5) * 60000;
  let rec = run.recommendation, focus = false, focusMissing = false;
  if (st.species) {
    const f = run.scopeViews?.bySpecies?.[st.species]?.focused;
    if (f) { rec = f; focus = true; } else focusMissing = true;
  } else if (st.spot && run.scopeViews?.byLocation) {
    const modes = modesOf(run, st.spot);
    const m = st.mode && modes.includes(st.mode) ? st.mode : null;
    rec = (m ? run.scopeViews.byLocation[`${st.spot}:${m}`]?.recommendation : bestModeRec(run, st.spot)) ?? run.recommendation;
  }
  const fr = freshness(run, now);
  return { def, run, rec, now, fr, focus, focusMissing, override, offline: !!def.offline, stale: fr.level === "stale" && override,
    partial: run.status === "partial" || (run.missingInputs?.length ?? 0) > 0, skip: rec.verdict === "SKIP",
    overall: run.recommendation, isBest: rec.id === run.recommendation.id, spotId: st.spot };
}

/* ---------- hash ---------- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const rich = D[RICH];
  const spot = p.get("spot"), mode = p.get("mode"), sp = p.get("species");
  st.tab = ["today", "spots", "species", "plan"].includes(p.get("tab")) ? p.get("tab") : "today";
  st.h = p.get("h") === "tomorrow" ? "tomorrow" : "today";
  st.spot = spot && locOf(rich, spot) ? spot : null;
  st.mode = st.spot && mode && modesOf(rich, st.spot).includes(mode) ? mode : null;
  st.species = sp && spCat(sp) ? sp : null;
  st.t = p.get("t") && !Number.isNaN(Date.parse(p.get("t"))) ? p.get("t") : null;
  st.state = STATES.some((x) => x.id === p.get("state")) ? p.get("state") : "maybe";
  st.day = Math.min(6, Math.max(0, Number(p.get("day")) || 0));
  const th = p.get("theme");
  if (th === "light" || th === "dark") document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
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
  if (st.state !== "maybe") p.set("state", st.state);
  if (st.tab === "plan" && st.day) p.set("day", st.day);
  const th = document.documentElement.dataset.theme; if (th) p.set("theme", th);
  try { history.replaceState(null, "", `#${p}`); } catch { /* sandboxed */ }
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`v5proto.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`v5proto.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

/* ---------- render orchestrator ---------- */
function render({ resetScroll = false } = {}) {
  const fk = document.activeElement?.dataset?.fk;
  const c = ctx();
  st.t = st.t && c.run.slots?.length ? st.t : null;
  renderHeader(c); renderCtl(c); renderBanner(c);
  const view = $("view");
  const nodes = st.tab === "today" ? todayView(c) : st.tab === "spots" ? spotsView(c) : st.tab === "species" ? speciesView(c) : planView(c);
  view.replaceChildren(h("h1", { class: "sr-only" }, { today: "Today", spots: "Spots", species: "Species", plan: "Plan" }[st.tab]), ...nodes);
  view.setAttribute("aria-busy", "false");
  document.querySelectorAll(".tab").forEach((b) => b.dataset.tab === st.tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  syncReview(); writeHash();
  if (resetScroll) window.scrollTo({ top: session.scroll[st.tab] ?? 0 });
  if (fk) document.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true });
  if (st.tab === "today") announce(c);
}
function announce(c) {
  const r = c.rec, focus = c.focus ? ` for ${r.targets?.[0]?.name ?? spName(st.species)}` : "";
  const text = `${VERDICT_SPOKEN[r.verdict]}${focus}. ${c.skip ? msg(r.headline) : `${r.displayName}, ${r.mode}, ${fmtRange(r.window.start, r.window.end)}`}.${c.stale ? " Last known report." : ""}`;
  if (text !== lastSpoken) { lastSpoken = text; $("live").textContent = text; }
}
function go(tab, opts) { session.scroll[st.tab] = window.scrollY; closeSheet(); st.tab = tab; render({ resetScroll: true, ...opts }); }
function scope({ spot = null, mode = null, species = null, persist = false, tab = "today" } = {}) {
  closeSheet(); st.spot = spot; st.mode = mode; st.species = species; st.t = null; st.h = st.h;
  if (persist) store.set("spot", spot ? { spot, mode } : null);
  session.scroll[st.tab] = window.scrollY; st.tab = tab; session.scroll[tab] = 0;
  render({ resetScroll: true });
}

/* ---------- header, control row, banner ---------- */
function renderHeader(c) {
  const { run, fr, offline } = c;
  const t = fmtTime(run.generatedAt);
  const chip = $("fresh");
  let text = t, tag = "Updated ", sv = "fresh";
  if (offline) { sv = "offline"; tag = "Offline · "; }
  else if (fr.level === "aging") { sv = "aging"; text = ageText(fr.age); }
  else if (c.stale) { sv = "stale"; tag = relDay(run.generatedAt, c.now) === "yesterday" ? "Yesterday " : "Updated "; }
  chip.dataset.s = sv; chip.replaceChildren(h("span", { class: "lbl" }, tag), text);
  chip.setAttribute("aria-label", `${tag}${text}`);
  const rb = $("refresh"); rb.disabled = offline;
  rb.setAttribute("aria-label", offline ? "Refresh unavailable while offline" : "Refresh report");
  const name = st.spot ? (locOf(run, st.spot)?.name ?? "Spot") : "Best anywhere";
  $("spot-label").textContent = name;
  $("spot-pill").setAttribute("aria-label", `Scope: ${name}. Change spot`);
}
function segment(label, items, cur, on, cls = "") {
  return h("div", { class: `seg ${cls}`, role: "group", "aria-label": label }, items.map(([id, text]) =>
    h("button", { type: "button", "aria-pressed": String(cur === id), "data-fk": `${label}-${id}`, onclick: () => on(id) }, text)));
}
function renderCtl(c) {
  const ctl = $("ctl"); ctl.replaceChildren();
  if (st.tab === "plan") return;
  ctl.append(segment("Report day", [["today", "Today"], ["tomorrow", "Tomorrow"]], st.h, (v) => { st.h = v; st.t = null; render(); }, "day"));
  if (st.tab !== "today") return;
  if (st.species) ctl.append(h("button", { class: "fchip", type: "button", "data-fk": "unfocus", "aria-label": `Targeting ${spName(st.species)}. Remove`, onclick: () => scope({ spot: st.spot, mode: st.mode }) },
    "Targeting: ", h("b", {}, spName(st.species)), h("i", {}, s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: PATHS.x })))));
  const modes = st.spot ? modesOf(c.run, st.spot) : [];
  if (modes.length > 1 && !st.species) {
    const cur = st.mode ?? c.rec.mode;
    ctl.append(segment("Mode", modes.map((m) => [m, modeLabel(m)]), cur, (m) => { st.mode = m; st.t = null; render(); }, "modes"));
  }
}
function renderBanner(c) {
  const slot = $("banner-slot"); slot.replaceChildren();
  if (st.tab !== "today") return;
  if (c.offline) slot.append(h("div", { class: "banner", role: "status" }, icon("off"), h("div", {},
    h("p", {}, h("b", {}, `Offline — showing the report from ${fmtTime(c.run.generatedAt)}.`)), h("p", {}, "Refresh is paused until you're back online. Everything else still works."))));
  else if (c.stale) {
    const when = `${relDay(c.run.generatedAt, c.now)} ${partWord(c.run.generatedAt)}`;
    slot.append(h("div", { class: "banner", role: "status" }, icon("warn"), h("div", {},
      h("p", {}, h("b", {}, `This report is from ${when === "earlier evening" ? "an earlier evening" : when}. Pull to refresh.`)), h("p", {}, "Windows that have passed are struck through; the next one is shown."))));
  }
}

/* ---------- TODAY ---------- */
function whenOf(c) { return c.skip ? msg(c.rec.whenLabel) : formatWhenLabel({ recommendation: c.rec }, c.now); }
function todayView(c) {
  const out = [verdictCard(c)];
  if (c.focusMissing) out.unshift(h("p", { class: "notice", role: "status" }, `${spName(st.species)} has no usable window in this run, so Today shows the overall best. Remove the chip to clear it.`));
  out.push(targetsCard(c), useCard(c), confCard(c), backupCard(c), whyCard(c), timesCard(c), conditionsCard(c), tvCard(c), spotsTeaser(c), sourcesCard(c));
  return out.filter(Boolean);
}
function verdictCard(c) {
  const { rec: r, run } = c;
  const safety = r.gates?.length > 0;
  const lvl = LEVEL[r.verdict];
  const C = 326.7, target = C * (1 - Math.max(0, Math.min(100, r.suitability ?? 0)) / 100);
  const arc = s("circle", { class: "ring-fill", cx: 60, cy: 60, r: 52, "stroke-dashoffset": C });
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute("stroke-dashoffset", target)));
  const ringIcon = r.verdict === "GO" ? "check" : r.verdict === "SKIP" ? (safety ? "shield" : "x") : "wave";
  const ring = h("div", { class: "ring", "aria-hidden": "true" },
    s("svg", { class: "rsvg", viewBox: "0 0 120 120" }, s("circle", { class: "ring-track", cx: 60, cy: 60, r: 52 }), arc),
    h("div", { class: "ring-text" }, icon(ringIcon), h("span", {}, r.verdict), c.stale ? h("small", {}, "Last known") : null));
  const reasonRaw = r.reason?.code && SHORT_REASON[r.reason.code] ? SHORT_REASON[r.reason.code] : msg(r.reason?.text ?? r.reason);
  const reason = r.verdict !== "GO" && reasonRaw ? h("p", { class: "why-line" }, reasonRaw) : null;
  const qual = r.amberQualifier && !c.skip ? h("p", { class: "qual" }, icon("warn"), msg(r.amberQualifier)) : null;
  const eyebrow = h("p", { class: "eyebrow" }, whenOf(c), c.focus ? h("span", { class: "tag" }, `for ${spName(st.species)}`) : null);
  const notes = [];
  if (c.focus && TIER[c.overall.verdict] < TIER[r.verdict]) notes.push(h("p", { class: "note" }, h("b", {}, "Overall today: "), formatVerdictLine(c.run).replace(/, [^,]*$/, "")));
  else if (st.spot && !c.focus && TIER[c.overall.verdict] < TIER[r.verdict]) notes.push(h("p", { class: "note" }, h("b", {}, "Best overall today: "), `${c.overall.displayName} (${c.overall.verdict})`));
  else if (st.h === "tomorrow") {
    const cmp = r.comparison?.kind;
    if (cmp) notes.push(h("p", { class: "note" }, h("b", {}, "vs today: "), DELTA[cmp].replace(" tomorrow", "")));
    const tw = D[RICH]?.recommendation?.window;
    if (tw && Date.parse(tw.end) > c.now) notes.push(h("p", { class: "note" }, `Today's window: ${fmtRange(tw.start, tw.end)}`));
  }
  const bet = c.skip ? nextOption(c) : betRow(c);
  return h("section", { class: `card hero${c.stale ? " dim" : ""}`, id: "verdict", "data-level": lvl, "aria-label": "Verdict" },
    h("div", { class: "hero-main" }, ring, h("div", { class: "hero-copy" }, eyebrow, h("h2", { class: "headline" }, msg(r.headline)), reason, qual)),
    notes, bet);
}
function windowLine(c) {
  const r = c.rec, w = r.window, st0 = Date.parse(w.start), en = Date.parse(w.end), range = fmtRange(w.start, w.end);
  const sameDay = dayKey(w.start) === dayKey(c.now);
  if (!sameDay) return h("p", { class: "win" }, `${range} · `, h("span", { class: "muted" }, st0 > c.now ? "Tomorrow" : ""));
  if (c.stale && en < c.now) {
    const next = (c.run.days ?? []).flatMap((d) => d.windows ?? []).filter((x) => Date.parse(x.start) > c.now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
    return h("p", { class: "win" }, h("s", {}, range), " ", next ? h("span", { class: "muted" }, `Next window ${fmtTime(next.start)}`) : h("span", { class: "muted" }, "Window ended"));
  }
  if (c.now >= st0 && c.now < en) return h("p", { class: "win" }, h("strong", {}, `Fish now — until ${fmtTime(w.end)}`));
  if (c.now < st0) return h("p", { class: "win" }, `${range} · `, h("span", { class: "muted" }, formatWindowStatus({ recommendation: r }, c.now, w)));
  return h("p", { class: "win" }, h("s", {}, range), " ", h("span", { class: "muted" }, "Window ended"));
}
function betRow(c) {
  const r = c.rec;
  const label = c.focus ? "Best for this fish" : st.spot ? "Best window here" : "Best bet";
  return h("button", { class: "bet", type: "button", "data-fk": "bet", onclick: (e) => openSpotDetail(r.locationId, r.mode, e.currentTarget) },
    h("div", {}, h("p", { class: "k" }, label), h("div", { class: "nm" }, r.displayName, h("span", { class: "mchip" }, modeIcon(r.mode), modeLabel(r.mode))), windowLine(c)), icon("arrow", "go-i"));
}
function nextOption(c) {
  const n = c.rec.nextOption;
  const body = n ? [h("div", { class: "nm" }, n.displayName, h("span", { class: "mchip" }, modeIcon(n.mode), modeLabel(n.mode)), n.verdict ? h("span", { class: "vchip", "data-v": n.verdict }, VERDICT_SPOKEN[n.verdict]) : null),
      h("p", { class: "win" }, n.label ? msg(n.label) : "", " · ", fmtRange(n.window.start, n.window.end))]
    : [h("p", { class: "win" }, "Check back later.")];
  return h("div", { class: "bet static" }, h("div", {}, h("p", { class: "k" }, "Next best option"), body));
}
function targetsCard(c) {
  const r = c.rec, targets = (r.targets ?? []).slice(0, 3);
  if (!targets.length) return null;
  const list = h("ul", { class: "targets" });
  for (const t of targets) {
    list.append(h("li", {}, h("button", { class: "t-btn", type: "button", "data-fk": `t-${t.speciesId}`, "aria-label": `${t.name}, suitability ${t.suitability}, ${t.band}. Open species`, onclick: (e) => openSpecies(t.speciesId, e.currentTarget) },
      h("span", { class: "t-name" }, t.name, ...(t.tags ?? []).map((g) => h("span", { class: "tag" }, g))),
      h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${t.suitability}%` })), h("span", { class: "t-num" }, t.suitability))));
    if (session.history) list.append(h("li", { class: "t-hist" }, `${t.name}: ${formatHistoricalRate(t.historicalRate, r.mode)}`));
  }
  const toggle = h("button", { class: "toggle", type: "button", "data-fk": "hist", "aria-pressed": String(session.history), onclick: () => { session.history = !session.history; render(); } }, "Local history", h("span", { class: "sw", "aria-hidden": "true" }));
  const hint = session.hint ? h("div", { class: "hint-row" }, h("p", { class: "hint" }, "Suitability = how well conditions fit each fish. It is not a catch chance."),
    h("button", { type: "button", "aria-label": "Dismiss hint", "data-fk": "hint-x", onclick: () => { session.hint = false; render(); } }, "×")) : null;
  const why = c.skip ? (c.rec.gates?.[0] ? msg(c.rec.gates[0].text ?? c.rec.gates[0]) : msg(r.reason?.text ?? r.reason)) : "";
  return h("section", { class: `card${c.skip ? " quiet" : ""}`, "aria-label": "Targets" },
    h("div", { class: "card-h" }, h("h2", {}, "Targets"), h("span", { class: "sub" }, "Suitability"), toggle),
    c.skip ? h("p", { class: "why-q" }, `Muted: ${why}`) : null,
    h("div", { class: "card-body" }, list, hint));
}
function useCard(c) {
  const r = c.rec, set = r.setup ?? {};
  const det = h("details", { class: `card use${c.skip ? " quiet" : ""}`, open: session.use || null });
  det.addEventListener("toggle", () => { session.use = det.open; });
  det.append(h("summary", { "data-fk": "use" }, h("b", {}, "Use"), h("span", {}, msg(r.useLine))),
    h("div", { class: "det-body" }, h("dl", {},
      set.where ? h("div", {}, h("dt", {}, "Where"), h("dd", {}, set.where)) : null,
      set.bait?.length ? h("div", {}, h("dt", {}, "Bait"), h("dd", {}, h("ul", {}, set.bait.map((b) => h("li", {}, b))))) : null,
      set.lures?.length ? h("div", {}, h("dt", {}, "Lures"), h("dd", {}, h("ul", {}, set.lures.map((b) => h("li", {}, b))))) : null,
      set.rig ? h("div", {}, h("dt", {}, "Rig"), h("dd", {}, set.rig)) : null),
      h("p", { class: "fine" }, "Check current FWC rules before you go.")));
  return det;
}
function confCard(c) {
  const r = c.rec;
  const [lvl, num, ...rest] = formatConfidence({ recommendation: r }).split(" · ");
  const det = h("details", { class: "how", open: session.conf || null });
  det.addEventListener("toggle", () => { session.conf = det.open; });
  det.append(h("summary", { "data-fk": "conf" }, "Why this confidence?"), h("ul", {}, (r.confidenceReasons ?? []).map((x) => h("li", {}, msg(x.text)))));
  return h("section", { class: "card conf", "aria-label": "Confidence" },
    h("div", { class: "conf-row" }, h("p", { class: "conf-line" }, "Confidence: ", h("b", {}, `${lvl.replace(" confidence", "")} · ${num}`)),
      c.partial ? h("span", { class: "vchip amber" }, icon("warn"), "Partial data") : null),
    rest.length ? h("p", { class: "conf-sum" }, `Our data: ${rest.join(" · ")}.`) : null,
    r.confidenceReasons?.length ? det : null);
}
function backupCard(c) {
  const b = c.rec.backup;
  if (!b) return null;
  const loc = locOf(c.run, b.locationId);
  const outside = b.distanceMi != null && b.distanceMi > 7;
  return h("button", { class: "bet backup", type: "button", "data-fk": "backup",
    onclick: () => scope({ spot: b.locationId, mode: b.mode }) },
    h("div", {}, h("p", { class: "k" }, "Backup"), h("div", { class: "nm" }, loc?.name ?? b.locationId, b.mode ? h("span", { class: "mchip" }, modeIcon(b.mode), modeLabel(b.mode)) : null, h("span", { class: "vchip", "data-v": b.verdict }, VERDICT_SPOKEN[b.verdict])),
      h("p", { class: "win muted" }, b.reason), outside && b.area ? h("p", { class: "fine" }, `In ${b.area}`) : null), icon("arrow", "go-i"));
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
  const rows = [...helps.map((f) => ({ e: "helps", t: `${f.label}: ${msg(f.humanLabel)}` })), ...(r.why ?? []).map((w) => ({ e: w.effect ?? (/unavailable|thin|buoy/i.test(w.code) ? "hurts" : "none"), t: msg(w) }))];
  const list = h("ul", { class: "whys" }, rows.map((w) => h("li", {}, effectMark(w.e, safety && w.e === "hurts"), h("span", {}, w.t))));
  let table = null;
  if (factors.length) {
    const det = h("details", { class: "how", open: session.factors || null });
    det.addEventListener("toggle", () => { session.factors = det.open; });
    det.append(h("summary", { "data-fk": "factors" }, "See all factors"), h("table", { class: "ftable" }, h("caption", { class: "sr-only" }, "All factors with effect, value and weight"),
      h("thead", { class: "sr-only" }, h("tr", {}, h("th", { scope: "col" }, "Factor"), h("th", { scope: "col" }, "Value and weight"))),
      h("tbody", {}, factors.map((f) => h("tr", {}, h("th", { scope: "row" }, h("b", {}, `${f.label}: ${msg(f.humanLabel)}`), h("small", {}, msg(f.detail))),
        h("td", {}, effectMark(f.effect, f.limiting && safety), h("div", {}, f.value == null || typeof f.value === "string" ? "—" : `${+f.value.toFixed(2)}${f.unit ? " " + f.unit : ""}`), h("small", {}, `weight ${f.weight?.toFixed(2) ?? "—"}`)))))));
    table = det;
  }
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
  const wins = [r.window, ...(c.run.days ?? []).flatMap((d) => d.windows ?? []).filter((w) => w.locationId === r.locationId && w.mode === r.mode)].filter(Boolean);
  const inWin = (at) => wins.some((w) => Date.parse(at) >= Date.parse(w.start) && Date.parse(at) < Date.parse(w.end));
  const hasSp = pts.some((p) => p.topSpecies?.length);
  let idx = 0;
  if (st.t) idx = Math.max(0, pts.findIndex((p) => p.at === st.t));
  else { const ni = pts.findIndex((p, i) => c.now >= Date.parse(p.at) && (i === n - 1 || c.now < Date.parse(pts[i + 1].at))); idx = ni >= 0 && c.now <= Date.parse(pts[n - 1].at) + step ? ni : Math.max(0, pts.findIndex((p) => inWin(p.at))); }
  const nowIdx = pts.findIndex((p, i) => c.now >= Date.parse(p.at) && (i === n - 1 || c.now < Date.parse(pts[i + 1].at)));

  const strip = h("div", { class: "scrub", role: "slider", tabindex: "0", "aria-orientation": "horizontal", "aria-label": "Time of day", "aria-valuemin": 0, "aria-valuemax": n - 1, "data-fk": "scrub" });
  const bars = pts.map((p, i) => h("span", { class: `sb${p.suitability == null ? " none" : ""}${inWin(p.at) ? " in" : ""}${i === nowIdx && c.now <= Date.parse(pts[n - 1].at) + step ? " now" : ""}`, style: `--h:${p.suitability == null ? 7 : Math.max(10, p.suitability)}%` }));
  strip.append(...bars);
  const axis = h("div", { class: "axis", "aria-hidden": "true" });
  pts.forEach((p, i) => { if (localMin(p.at) === 0 && localHour(p.at) % 3 === 0) axis.append(h("span", { style: `left:${((i + 0.5) / n) * 100}%` }, fmtTime(p.at))); });
  const day = h("div", { class: "daybar", "aria-hidden": "true" });
  if (light) (light.sunrise ?? []).forEach((rise) => { const set = (light.sunset ?? []).find((z) => Date.parse(z) > Date.parse(rise)); if (set) { const a = Math.max(0, (Date.parse(rise) - t0) / span), b = Math.min(1, (Date.parse(set) - t0) / span); if (b > a) day.append(h("i", { style: `left:${a * 100}%;width:${(b - a) * 100}%` })); } });
  if (light) (light.sunset ?? []).forEach((set) => { if (!(light.sunrise ?? []).some((rise) => Date.parse(set) > Date.parse(rise))) { const b = Math.min(1, (Date.parse(set) - t0) / span); if (b > 0) day.append(h("i", { style: `left:0;width:${b * 100}%` })); } });

  const readout = h("div", { class: "readout" });
  function update(i, { commit = false } = {}) {
    idx = Math.max(0, Math.min(n - 1, i));
    const p = pts[idx];
    bars.forEach((b, k) => b.classList.toggle("on", k === idx));
    const txt = `${fmtTime(p.at)}, ${p.suitability == null ? "no fishing window" : `suitability ${p.suitability}`}`;
    strip.setAttribute("aria-valuenow", idx); strip.setAttribute("aria-valuetext", txt);
    const isNow = idx === nowIdx;
    const lightTxt = lightAt(light, p.at);
    const tide = p.tide?.heightFt != null ? { v: cap(p.tide.direction ?? "—"), d: `${p.tide.heightFt.toFixed(1)} ft` } : null;
    readout.replaceChildren(
      h("div", { class: "ro-top" }, h("span", { class: "t" }, fmtTime(p.at)), h("span", { class: "vchip", "data-v": inWin(p.at) ? "GO" : null }, inWin(p.at) ? "In a best window" : p.suitability == null ? "No window" : "Outside windows"),
        isNow ? null : h("button", { class: "btn-s", type: "button", "data-fk": "now", onclick: () => { st.t = null; update(nowIdx >= 0 ? nowIdx : 0); writeHash(); strip.focus({ preventScroll: true }); } }, "Back to now")),
      h("div", { class: "stats ro-tiles" },
        h("div", { class: `stat${tide ? "" : " off"}` }, h("p", { class: "k" }, "Tide"), h("p", { class: "v" }, tide?.v ?? "Unavailable"), tide ? h("p", { class: "d" }, tide.d) : null),
        h("div", { class: `stat${lightTxt ? "" : " off"}` }, h("p", { class: "k" }, "Light"), h("p", { class: "v" }, lightTxt?.v ?? "—"), lightTxt?.d ? h("p", { class: "d" }, lightTxt.d) : null),
        h("div", { class: `stat${p.suitability == null ? " off" : ""}` }, h("p", { class: "k" }, "Suitability"), h("p", { class: "v" }, p.suitability ?? "—"), h("p", { class: "d" }, "this spot, this time"))),
      speciesAt(p));
    if (commit) { st.t = p.at; writeHash(); }
  }
  function speciesAt(p) {
    const list = p.topSpecies ?? [];
    if (!hasSp) return h("p", { class: "fine" }, "This sample has no per-time species scores, so the window targets above stay as shown.");
    if (!list.length) return h("p", { class: "fine" }, "No species ranking at this time: it falls outside a fishing window.");
    return h("ul", { class: "ro-sp", "aria-label": "Species at this time" }, list.map((x) => h("li", {}, h("button", { class: "t-btn", type: "button", onclick: (e) => openSpecies(x.speciesId, e.currentTarget) },
      h("span", { class: "t-name" }, spName(x.speciesId), x.speciesId === st.species ? h("span", { class: "tag" }, "Targeting") : null),
      h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${x.suitability}%` })), h("span", { class: "t-num" }, x.suitability)))));
  }
  const fromX = (e) => { const b = strip.getBoundingClientRect(); return Math.floor(((e.clientX - b.left) / b.width) * n); };
  let down = false;
  strip.addEventListener("pointerdown", (e) => { down = true; strip.setPointerCapture(e.pointerId); update(fromX(e)); });
  strip.addEventListener("pointermove", (e) => { if (down) update(fromX(e)); });
  const end = () => { if (down) { down = false; st.t = pts[idx].at; writeHash(); } };
  strip.addEventListener("pointerup", end); strip.addEventListener("pointercancel", end);
  strip.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -4, PageUp: 4 }[e.key];
    if (k != null) { e.preventDefault(); update(idx + k, { commit: true }); }
    else if (e.key === "Home") { e.preventDefault(); update(0, { commit: true }); } else if (e.key === "End") { e.preventDefault(); update(n - 1, { commit: true }); }
  });
  update(idx);
  const events = (c.run.slots?.[0]?.tideEvents ?? []).slice(0, 4).map((e) => `${e.type === "high" ? "High" : "Low"} ${fmtTime(e.at)}`).join(" · ");
  return h("section", { class: "card", "aria-label": "Best times" },
    h("div", { class: "card-h" }, h("h2", {}, "Best times"), h("span", { class: "sub" }, "Drag or tap to scrub")),
    strip, axis, day,
    h("div", { class: "legend", "aria-hidden": "true" }, h("span", {}, h("i", {}), "Window"), h("span", {}, h("i", { class: "d" }), "Daylight"), h("span", {}, h("i", { class: "n" }), "No window"), h("span", {}, h("i", { class: "o" }), "Selected")),
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
  const f = c.isBest && !st.species ? (c.run._proto?.factors ?? []) : [];
  if (!f.length) return null;
  const safety = (c.rec.gates?.length ?? 0) > 0;
  return h("section", { class: "card", "aria-label": "Conditions" }, h("div", { class: "card-h" }, h("h2", {}, "Conditions"), h("span", { class: "sub" }, "Plain words first")),
    h("div", { class: "stats" }, f.map((x) => h("div", { class: `stat${x.available === false ? " off" : ""}` },
      h("p", { class: "k" }, effectMark(x.effect, x.limiting && safety), x.label), h("p", { class: "v" }, msg(x.humanLabel)),
      h("p", { class: "d" }, x.value == null || typeof x.value === "string" ? "" : `${+x.value.toFixed(1)} ${x.unit ?? ""}`.trim())))));
}
function tvCard(c) {
  const d = c.run.days ?? [];
  if (d.length < 2) return null;
  const cmp = D[RICH]?.recommendation.comparison?.kind ?? c.rec.comparison?.kind;
  const card = (label, day, target) => { const w = day.windows?.[0];
    return h("button", { class: "tv-c", type: "button", style: "text-align:left;cursor:pointer;color:inherit", onclick: () => { st.h = target; st.t = null; render({ resetScroll: false }); window.scrollTo({ top: 0 }); } },
      h("p", { class: "k" }, label, h("span", { class: "vchip", "data-v": day.verdict }, VERDICT_SPOKEN[day.verdict])),
      w ? h("p", { class: "w" }, fmtRange(w.start, w.end)) : h("p", { class: "w" }, "No good window"),
      w ? h("p", { class: "s" }, `${w.displayName ?? ""} · ${partWord(w.start)}`) : h("p", { class: "s" }, msg(day.reason))); };
  return h("section", { class: "card", "aria-label": "Today versus tomorrow" }, h("div", { class: "card-h" }, h("h2", {}, "Today vs tomorrow")),
    h("div", { class: "tv" }, card("Today", d[0], "today"), card("Tomorrow", d[1], "tomorrow")), cmp ? h("p", { class: "delta" }, DELTA[cmp]) : null);
}
function spotsTeaser(c) {
  const rows = spotRows(c.run, "all").slice(0, 3);
  if (!rows.length) return null;
  return h("section", { class: "card", "aria-label": "Other spots" }, h("div", { class: "card-h" }, h("h2", {}, "Other spots"), h("button", { class: "btn-s", type: "button", "data-fk": "allspots", onclick: () => go("spots") }, "See all spots")),
    h("ul", { class: "list" }, rows.map((r) => spotRowEl(r, c, { star: false }))));
}
function sourcesCard(c) {
  const run = c.run, srcs = run.inputs?.sourceStatus ?? [], missing = srcs.filter((x) => x.available === false);
  const det = h("details", { class: "card use", open: session.sources || null, id: "sources" });
  det.addEventListener("toggle", () => { session.sources = det.open; });
  det.append(h("summary", { "data-fk": "sources" }, h("span", {}, "Data & sources"), missing.length ? h("span", { class: "vchip amber" }, `${missing.length} missing`) : null),
    h("div", { class: "det-body" }, h("ul", { class: "src-list" }, srcs.map((x) => h("li", { "data-bad": x.available === false ? "" : null }, h("span", {}, x.label ?? x.kind), h("span", {}, x.available === false ? "Unavailable" : `${x.status === "current" ? "Current" : "Stale"} · ${fmtTime(x.fetchedAt)}`)))),
      missing.length ? h("p", { class: "fine" }, `Missing right now: ${missing.map((m) => (m.label ?? m.kind).toLowerCase()).join(", ")}.`) : null,
      h("p", { class: "fine" }, `Model ${run.modelVersion} · run ${fmtTime(run.generatedAt)} · all times Eastern. Prototype data.`)));
  return det;
}

/* ---------- SPOTS ---------- */
function spotRows(run, filter) {
  const by = run.scopeViews?.byLocation ?? {}, favs = store.get("favs", []);
  const rows = [];
  (run.locations ?? []).forEach((loc, order) => {
    const entries = loc.modes.filter((m) => filter === "all" || m === filter).map((m) => by[`${loc.id}:${m}`]?.recommendation).filter(Boolean);
    if (!entries.length) return;
    const rec = entries.sort((a, b) => TIER[a.verdict] - TIER[b.verdict] || b.suitability - a.suitability)[0];
    const dist = session.near && session.near !== "denied" ? haversine(session.near, loc) : null;
    rows.push({ loc, rec, order, fav: favs.includes(loc.id), dist, bucket: Math.floor(rec.suitability / 5) });
  });
  // Display order: verdict tier, then 5-point suitability buckets (ties are not meaningful), then Near me, favourite, catalog.
  return rows.sort((a, b) => TIER[a.rec.verdict] - TIER[b.rec.verdict] || b.bucket - a.bucket || (a.dist != null && b.dist != null ? a.dist - b.dist : 0) || Number(b.fav) - Number(a.fav) || a.order - b.order);
}
function spotRowEl(r, c, { star = true, onPick } = {}) {
  const { loc, rec } = r;
  const top = rec.targets?.[0];
  const pick = () => (onPick ?? ((l, m) => scope({ spot: l, mode: m, persist: true })))(loc.id, st.f === "all" ? (loc.modes.length > 1 ? null : loc.modes[0]) : st.f);
  const favs = store.get("favs", []);
  return h("li", { class: `row${st.spot === loc.id ? " sel" : ""}${star ? "" : " nostar"}` },
    h("button", { class: "main", type: "button", "data-fk": `spot-${loc.id}`, "aria-label": `${loc.name}, ${rec.verdict}, ${rec.mode}, ${fmtRange(rec.window.start, rec.window.end)}${top ? `, ${top.name} ${top.suitability}` : ""}`, onclick: pick },
      h("div", { class: "r1" }, h("span", { class: "nm" }, loc.name), h("span", { class: "vchip", "data-v": rec.verdict }, VERDICT_SPOKEN[rec.verdict])),
      h("p", { class: "r2" }, h("span", { class: "mi" }, loc.modes.map((m) => modeIcon(m))), `${loc.modes.map(modeLabel).join(" / ")} · ${loc.area}`, r.dist != null ? ` · ${r.dist.toFixed(1)} mi` : ""),
      h("p", { class: "r2" }, `${fmtRange(rec.window.start, rec.window.end)}${top ? ` · ${top.name} ${top.suitability}` : ""}`)),
    star ? h("button", { class: "star", type: "button", "data-fk": `star-${loc.id}`, "aria-pressed": String(favs.includes(loc.id)), "aria-label": `Favourite ${loc.name}`, onclick: () => { const f = store.get("favs", []); store.set("favs", f.includes(loc.id) ? f.filter((x) => x !== loc.id) : [...f, loc.id]); rerenderList(); } }, icon("star")) : null);
}
let listHost = null;
function rerenderList() { if (listHost) { const fk = document.activeElement?.dataset?.fk; listHost.rebuild(); if (fk) listHost.el.querySelector(`[data-fk="${fk}"]`)?.focus({ preventScroll: true }); } }
function spotList(c, { onPick } = {}) {
  const el = h("div", { class: "spotlist" });
  const rebuild = () => {
    const rows = spotRows(c.run, st.f);
    const best = c.run.recommendation;
    const anyRow = h("li", { class: `row any nostar${!st.spot ? " sel" : ""}` }, h("button", { class: "main", type: "button", "data-fk": "spot-any", "aria-label": `Best anywhere, ${best.verdict}, currently ${best.displayName}`, onclick: () => (onPick ?? (() => scope({ persist: true })))(null, null) },
      h("div", { class: "r1" }, h("span", { class: "nm" }, "Best anywhere"), h("span", { class: "vchip", "data-v": best.verdict }, VERDICT_SPOKEN[best.verdict])),
      h("p", { class: "r2" }, `Default scope · today it is ${best.displayName}`)));
    const favRows = rows.filter((r) => r.fav);
    const near = h("button", { class: "btn-s", type: "button", "data-fk": "near", "aria-pressed": String(!!session.near && session.near !== "denied"), onclick: askNear }, "Near me");
    el.replaceChildren(
      h("div", { class: "tools-row" }, segment("Mode filter", [["all", "All"], ["surf", "Surf"], ["pier", "Pier"], ["inshore", "Inshore"]], st.f, (v) => { st.f = v; rebuild(); document.querySelector(`[data-fk="Mode filter-${v}"]`)?.focus({ preventScroll: true }); }), near),
      session.near === "denied" ? h("p", { class: "notice", role: "status" }, "Location is off — showing best first.") : "",
      h("ul", { class: "list" }, anyRow, favRows.length ? favRows.map((r) => spotRowEl(r, c, { onPick })) : "", rows.filter((r) => !r.fav).map((r) => spotRowEl(r, c, { onPick }))));
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
  return [h("section", { class: "card", "aria-label": "Spots" }, h("div", { class: "card-h" }, h("h2", {}, "Spots"), h("span", { class: "sub" }, "Ranked by verdict, then fit")), spotList(c))];
}

/* ---------- SPECIES ---------- */
function speciesRows(c) {
  const run = c.run;
  return SPECIES.map((sp) => {
    const cands = (run.candidates ?? []).filter((x) => x.speciesId === sp.id && (st.f === "all" || x.mode === st.f));
    const best = cands.sort((a, b) => (b.suitability ?? -1) - (a.suitability ?? -1))[0] ?? null;
    const focused = run.scopeViews?.bySpecies?.[sp.id]?.focused ?? null;
    return { sp, best, focused, suit: focused?.suitability ?? best?.suitability ?? null };
  }).filter((x) => st.f === "all" || x.sp.modes.includes(st.f)).sort((a, b) => (b.suit ?? -1) - (a.suit ?? -1));
}
function speciesView(c) {
  const rows = speciesRows(c);
  const grid = h("ul", { class: "grid" }, rows.map(({ sp, best, suit, focused }) =>
    h("li", {}, h("button", { class: `sp${suit == null || (!focused && best?.eligibility !== "realistic") ? " dimmed" : ""}${st.species === sp.id ? " on" : ""}`, type: "button", "data-fk": `sp-${sp.id}`,
      "aria-label": `${sp.name}, ${suit == null ? "no reading" : `suitability ${suit}`}${sp.bycatch ? ", bycatch" : ""}`, onclick: (e) => openSpecies(sp.id, e.currentTarget) },
      h("p", { class: "n" }, sp.name, sp.bycatch ? h("span", { class: "tag" }, "Bycatch") : null),
      h("div", { class: "big" }, h("b", {}, suit ?? "—"), h("span", {}, suit == null ? "no window" : best?.band ?? "")),
      h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${suit ?? 0}%` }))))));
  return [h("section", { class: "card", "aria-label": "Species" },
    h("div", { class: "card-h" }, h("h2", {}, "Species"), h("span", { class: "sub" }, "Suitability, best first")),
    st.species ? h("p", { class: "notice" }, `Targeting ${spName(st.species)}. Today is re-ranked for it.`) : null,
    h("div", { class: "tools-row" }, segment("Mode filter", [["all", "All"], ["surf", "Surf"], ["pier", "Pier"], ["inshore", "Inshore"]], st.f, (v) => { st.f = v; render(); })), grid)];
}

/* ---------- PLAN ---------- */
function planView(c) {
  const days = c.run.days ?? D[RICH].days;
  const sel = days[Math.min(st.day, days.length - 1)];
  const lab = (d) => d.kind === "outlook" ? d.outlookLabel : d.verdict;
  const strip = h("ul", { class: "wk-bars", "aria-label": "Next 7 days" }, days.map((d, i) => h("li", {},
    h("button", { class: `wk-col${d.kind === "outlook" ? " outlook" : ""}`, type: "button", "data-l": lab(d), "data-fk": `day-${i}`, "aria-pressed": String(i === st.day), "aria-controls": "daypanel", "aria-label": `${i === 0 ? "Today" : wk(d.date, { weekday: "long" })}, ${lab(d)}${d.kind === "outlook" ? " outlook" : ""}`, onclick: () => { st.day = i; render(); } },
      h("span", { class: "wk-lab" }, lab(d)), h("span", { class: "wk-track" }, h("span", { class: "wk-bar", style: `height:${BAR_H[lab(d)] ?? 30}%` })),
      h("span", { class: "wk-day" }, i === 0 ? "Today" : wk(d.date, { weekday: "short" })), h("span", { class: "wk-meta" }, wk(d.date, { month: "numeric", day: "numeric" }))))));
  const open = (target) => { st.h = target; st.t = null; go("today"); };
  let body;
  if (sel.kind === "forecast") {
    body = [h("div", { class: "kv" }, h("span", { class: "vchip", "data-v": sel.verdict }, sel.verdict), h("span", { class: "muted" }, `Confidence ${sel.confidence}`)),
      h("p", { class: "fine" }, msg(sel.reason)),
      sel.windows?.length ? h("div", { class: "block" }, h("h3", {}, "Windows"), h("ul", { class: "wins" }, sel.windows.map((w) => h("li", {}, h("span", {}, w.displayName, h("small", {}, `${modeLabel(w.mode)} · ${w.partOfDay}`)), h("b", {}, fmtRange(w.start, w.end)))))) : null,
      sel.topSpecies?.length ? h("div", { class: "block" }, h("h3", {}, "Top species"), h("ul", { class: "targets" }, sel.topSpecies.slice(0, 3).map((t) => h("li", {}, h("button", { class: "t-btn", type: "button", onclick: (e) => openSpecies(t.speciesId, e.currentTarget) }, h("span", { class: "t-name" }, t.name), h("div", { class: "bar-m", "aria-hidden": "true" }, h("i", { style: `width:${t.suitability}%` })), h("span", { class: "t-num" }, t.suitability)))))) : null,
      h("div", { class: "cta" }, h("button", { class: "btn", type: "button", "data-fk": "open-day", onclick: () => open(st.day === 0 ? "today" : "tomorrow") }, `Open ${st.day === 0 ? "Today" : "Tomorrow"}`))];
  } else {
    const bw = sel.bestWindow ?? {};
    body = [h("div", { class: "kv" }, h("span", { class: "vchip", "data-l": sel.outlookLabel }, `${sel.outlookLabel} outlook`), h("span", { class: "muted" }, `Confidence ${sel.confidence}`)),
      h("p", { class: "fine" }, msg(sel.reason)),
      h("p", { style: "margin-top:12px;font-size:14px" }, [cap(bw.partOfDay), bw.tidePhase ? `${bw.tidePhase} tide` : null].filter(Boolean).join(" · ") || "Part of day not yet known"),
      h("p", { class: "fine" }, "Outlook days name no spot or exact window: wind and surf are not reliable this far ahead.")];
  }
  return [h("section", { class: "card", "aria-label": "Plan" }, h("div", { class: "card-h" }, h("h2", {}, "Next 7 days"), h("span", { class: "sub" }, "Days 1–2 forecast, 3–7 outlook")), strip,
      h("p", { class: "fine" }, "Solid bars are forecast days (GO / MAYBE / SKIP). Dashed bars are outlook days (Promising / Mixed / Tough); bar height only echoes the label.")),
    h("section", { class: "card daycard", id: "daypanel", role: "region", "aria-live": "polite", "aria-label": "Day detail" },
      h("div", { class: "card-h" }, h("h2", {}, `${st.day === 0 ? "Today" : wk(sel.date, { weekday: "long" })}, ${wk(sel.date, { month: "short", day: "numeric" })}`), h("span", { class: "sub" }, sel.kind === "outlook" ? "Outlook" : "Forecast")), body)];
}

/* ---------- sheets ---------- */
let sheet = null;
function openSheet(title, body, opener) {
  closeSheet(true);
  const prev = opener ?? document.activeElement;
  const titleId = "sheet-title";
  const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("div", { class: "sheet-h" }, h("div", { class: "grab", "aria-hidden": "true" }), h("div", { class: "sheet-t" }, h("h2", { id: titleId }, title),
      h("button", { class: "xbtn", type: "button", "aria-label": "Close", "data-fk": "sheet-x", onclick: () => closeSheet() }, s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: PATHS.x }))))),
    h("div", { class: "sheet-b" }, body));
  const scrim = h("div", { class: "scrim", onclick: () => closeSheet() });
  $("sheet-root").replaceChildren(scrim, panel);
  $("app").inert = true; $("tabbar").inert = true; $("review").inert = true;
  sheet = { panel, prev, prevFk: prev?.dataset?.fk };
  const hd = panel.querySelector(".sheet-h"); let y0 = null, dy = 0;
  hd.addEventListener("pointerdown", (e) => { y0 = e.clientY; hd.setPointerCapture(e.pointerId); panel.classList.add("drag"); });
  hd.addEventListener("pointermove", (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
  const rel = () => { if (y0 == null) return; y0 = null; panel.classList.remove("drag"); if (dy > 90) closeSheet(); else panel.style.transform = ""; dy = 0; };
  hd.addEventListener("pointerup", rel); hd.addEventListener("pointercancel", rel);
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
function closeSheet(silent) {
  if (!sheet) return;
  const { prev, prevFk } = sheet; sheet = null;
  $("sheet-root").replaceChildren();
  $("app").inert = false; $("tabbar").inert = false; $("review").inert = false;
  if (silent) return;
  const target = prev?.isConnected ? prev : prevFk ? document.querySelector(`[data-fk="${prevFk}"]`) : null;
  (target ?? $("view")).focus?.({ preventScroll: true });
}
function openSpotSheet(opener) {
  const c = ctx();
  openSheet("Choose a spot", h("div", {}, spotList(c)), opener);
}
function openSpotDetail(id, mode, opener) {
  const c = ctx(), loc = locOf(c.run, id), cat = SPOTS.find((x) => x.id === id);
  if (!cat) return;
  const body = h("div", {},
    h("p", { class: "muted" }, `${loc?.area ?? ""} · ${loc?.modes?.map(modeLabel).join(" / ") ?? ""}`),
    cat.notes ? h("p", { style: "margin-top:10px" }, cat.notes) : null,
    cat.access?.length ? h("div", { class: "block" }, h("h3", {}, "Access"), h("ul", { style: "margin:0;padding-left:18px" }, cat.access.map((a) => h("li", {}, a)))) : null,
    cat.tips?.length ? h("div", { class: "block" }, h("h3", {}, "Tips"), h("ul", { style: "margin:0;padding-left:18px" }, cat.tips.map((a) => h("li", {}, a)))) : null,
    h("div", { class: "cta" }, st.spot === id ? null : h("button", { class: "btn", type: "button", onclick: () => scope({ spot: id, mode }) }, "Scope Today to this spot"), h("button", { class: "btn alt", type: "button", onclick: () => closeSheet() }, "Close")));
  openSheet(cat.name, body, opener);
}
function openSpecies(id, opener) {
  const c = ctx(), sp = spCat(id);
  if (!sp) return;
  const run = c.run;
  const focused = run.scopeViews?.bySpecies?.[id]?.focused ?? null;
  const cands = (run.candidates ?? []).filter((x) => x.speciesId === id).sort((a, b) => (b.suitability ?? -1) - (a.suitability ?? -1));
  const best = (focused && cands.find((x) => x.locationId === focused.locationId && x.mode === focused.mode)) ?? cands[0] ?? null;
  const suit = focused?.suitability ?? best?.suitability ?? null;
  const curve = best?.seasonCurve ?? [];
  const mx = Math.max(0.0001, ...curve.filter((v) => v != null));
  const month = best?.historicalRate?.month;
  const setup = focused?.setup ?? sp.setup, byMode = best && sp.byMode?.[best.mode] ? { ...setup, ...sp.byMode[best.mode] } : setup;
  const place = focused ?? (best && { displayName: locOf(run, best.locationId)?.name, mode: best.mode, window: best.window });
  const realistic = focused || best?.eligibility === "realistic";
  const reason = best && best.eligibility !== "realistic" && best.eligibilityReason ? msg({ kind: "reason", ...best.eligibilityReason }) : "";
  const body = h("div", {},
    sp.alt ? h("p", { class: "muted" }, sp.alt) : null,
    h("div", { class: "kv", style: "margin-top:10px" }, h("span", { class: "stat-big" }, suit ?? "—"), h("span", { class: "muted" }, suit == null ? "No fishing window in this run" : `Suitability${best?.band ? ` · ${best.band}` : ""}`), sp.bycatch ? h("span", { class: "tag" }, "Bycatch") : null),
    !realistic && reason ? h("p", { class: "fine" }, reason) : null,
    place?.displayName ? h("div", { class: "block" }, h("h3", {}, "Best place and time"), h("p", { style: "font-weight:600" }, place.displayName, " ", h("span", { class: "mchip" }, modeIcon(place.mode), modeLabel(place.mode))), place.window ? h("p", { class: "muted" }, fmtRange(place.window.start, place.window.end)) : null) : null,
    curve.length === 12 ? h("div", { class: "block" }, h("h3", {}, "Season by month"),
      h("div", { class: "season", role: "img", "aria-label": `Seasonal pattern by month, ${sp.name}. Strongest ${MONTHS.map((_, i) => i).filter((i) => curve[i] === Math.max(...curve.filter((v) => v != null)))?.map((i) => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, i, 1)))).join(", ")}.` },
        curve.map((v, i) => h("div", { class: `m${i + 1 === month ? " cur" : ""}${v == null ? " nul" : ""}` }, h("div", { class: "tr" }, v == null ? null : h("i", { style: `height:${Math.max(4, (v / mx) * 100)}%` })), h("span", { class: "l", "aria-hidden": "true" }, MONTHS[i])))),
      h("p", { class: "fine" }, "Regional share of surveyed trips that caught it, by month (relative bars). Today's month is outlined.")) : null,
    best?.historicalRate ? h("div", { class: "block" }, h("h3", {}, "Local history"), h("p", { style: "font-size:14px" }, formatHistoricalRate(best.historicalRate, best.mode))) : null,
    h("div", { class: "block" }, h("h3", {}, "Setup"), h("dl", {},
      byMode.where ? h("div", {}, h("dt", {}, "Where"), h("dd", {}, byMode.where)) : null,
      byMode.bait?.length ? h("div", {}, h("dt", {}, "Bait"), h("dd", {}, h("ul", {}, byMode.bait.map((b) => h("li", {}, b))))) : null,
      byMode.lures?.length ? h("div", {}, h("dt", {}, "Lures"), h("dd", {}, h("ul", {}, byMode.lures.map((b) => h("li", {}, b))))) : null,
      byMode.rig ? h("div", {}, h("dt", {}, "Rig"), h("dd", {}, byMode.rig)) : null,
      sp.tip ? h("div", {}, h("dt", {}, "Tip"), h("dd", {}, sp.tip)) : null), h("p", { class: "fine" }, "Check current FWC rules before you go.")),
    h("div", { class: "cta" },
      sp.bycatch ? h("p", { class: "fine" }, "Bycatch species are never a target, so there is no Target this.") :
      st.species === id ? h("button", { class: "btn alt", type: "button", onclick: () => scope({ spot: st.spot, mode: st.mode }) }, "Stop targeting") :
      h("button", { class: "btn", type: "button", disabled: focused ? null : true, "aria-describedby": focused ? null : "tt-why", onclick: () => scope({ spot: null, species: id }) }, `Target this: ${sp.name}`),
      !sp.bycatch && !focused ? h("p", { class: "fine", id: "tt-why" }, `No usable window for ${sp.name} in this run, so it can't re-rank Today.`) : null));
  openSheet(sp.name, body, opener);
}

/* ---------- toast, review ---------- */
let toastTimer;
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600); }
function setTheme(t) { if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; writeHash(); syncReview(); }
function syncReview() {
  document.querySelectorAll("#review-states button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === st.state)));
  const t = document.documentElement.dataset.theme ?? "auto";
  document.querySelectorAll("#review-themes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === t)));
}
async function setState(id) { const def = STATES.find((x) => x.id === id); await load(def.file); st.state = id; st.tab = "today"; st.h = "today"; st.spot = null; st.mode = null; st.species = null; st.t = null; lastSpoken = ""; closeSheet(true); render({ resetScroll: true }); }
function initReview() {
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
  $("refresh").addEventListener("click", () => {
    const chip = $("fresh"), rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    chip.replaceChildren(rm ? "" : h("span", { class: "spin" }), "Updating…");
    setTimeout(() => render(), 900);
  });
  initReview();
  $("view").replaceChildren(h("div", { class: "skel", style: "height:190px", "aria-label": "Reading the water…" }), h("div", { class: "skel", style: "height:120px;margin-top:12px" }));
  try {
    const first = new URLSearchParams(location.hash.slice(1));
    const wanted = STATES.find((x) => x.id === first.get("state")) ?? STATES[0];
    await Promise.all([load(RICH), load(TOMORROW), load(wanted.file)]);
    const p = readHash();
    if (!location.hash) { const saved = store.get("spot", null); if (saved && locOf(D[RICH], saved.spot)) { st.spot = saved.spot; st.mode = saved.mode ?? null; } }
    render({ resetScroll: true });
    if (p.get("t") && st.tab === "today") render();
  } catch (e) {
    console.error(e);
    $("view").replaceChildren(h("div", { class: "card" }, h("h2", {}, "Couldn't read the report"), h("p", { class: "muted" }, "Something went wrong reading the report. Try again, or check back in a few minutes."),
      h("div", { class: "cta" }, h("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Try again"))));
    $("view").setAttribute("aria-busy", "false");
  }
  addEventListener("hashchange", async () => { const p = new URLSearchParams(location.hash.slice(1)); const d = STATES.find((x) => x.id === p.get("state")); if (d) await load(d.file); readHash(); render(); });
}
init();
