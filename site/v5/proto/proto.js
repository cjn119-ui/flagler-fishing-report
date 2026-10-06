// V5 Today prototype. Renders ONLY from sample JSON (contract-shaped PredictionRun). No scoring logic here.
// Pre-built copy comes from the JSON and from ../engine/copy.js (pure formatters). Everything below is layout.
import { formatWhenLabel, formatWindowStatus, formatHistoricalRate, formatConfidence, formatCopyMessage } from "../engine/copy.js";

const TZ = "America/New_York";
const STATES = [
  { id: "go",      label: "Perfect day (GO)",   file: "sample-go.json",      nowOffsetMin: 30 },
  { id: "maybe",   label: "MAYBE",              file: "sample-today.json",   nowOffsetMin: 5 },
  { id: "skip",    label: "SKIP",               file: "sample-skip.json",    nowOffsetMin: 10 },
  { id: "stale",   label: "Stale",              file: "sample-stale.json",   nowIso: "2026-10-05T12:05:00.000Z" },
  { id: "offline", label: "Offline, last known",file: "sample-go.json",      nowOffsetMin: 38, offline: true },
  { id: "partial", label: "Partial data",       file: "sample-partial.json", nowOffsetMin: 20 },
];
const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
const AGING_MIN = 90, STALE_MIN = 360; // spec: fresh < 90 min, aging 90 min–6 h, stale > 6 h

const session = { history: false, factors: false, use: false, conf: false, sources: false, hint: true };
const cache = new Map();
let current = null; // { state, run, now }
let tab = "today";

/* ---------- tiny DOM helpers ---------- */
const NS = "http://www.w3.org/2000/svg";
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
function add(el, kids) { for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); }
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  add(el, kids);
  return el;
}
function icon(name, cls = "") {
  const paths = {
    check: "M5 12.5 10 17.5 19 7", wave: "M3 9c2.2 0 2.2 2 4.5 2S9.8 9 12 9s2.2 2 4.5 2S18.8 9 21 9M3 15c2.2 0 2.2 2 4.5 2s2.3-2 4.5-2 2.2 2 4.5 2 2.3-2 4.5-2",
    x: "M6 6l12 12M18 6 6 18", shield: "M12 3 5 6v5c0 4.6 3 8 7 10 4-2 7-5.4 7-10V6l-7-3ZM12 8v5M12 16.2v.1",
    up: "M12 6l6 9H6z", dash: "M6 12h12", down: "M12 18 6 9h12z", warn: "M12 4 3 20h18L12 4ZM12 10v5M12 17.5v.1",
    chev: "m7 10 5 5 5-5", arrow: "m9 6 6 6-6 6", clock: "M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z", off: "M3 3l18 18M8.5 8.5a6 6 0 0 0-1.4 3M16.4 13a6 6 0 0 0-3-3.4M5 12a10 10 0 0 1 3-2.4M19 12a10 10 0 0 0-1.6-2.2M12 18v.1",
  };
  return s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", class: cls }, s("path", { d: paths[name] }));
}

/* ---------- formatting (display only) ---------- */
const fmtTime = (d) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d)).replace(":00", "");
const ampm = (t) => t.match(/\s([AP]M)$/)?.[1];
const fmtRange = (a, b) => { const x = fmtTime(a), y = fmtTime(b); return `${ampm(x) && ampm(x) === ampm(y) ? x.replace(/\s[AP]M$/, "") : x}–${y}`; };
const localHour = (d) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date(d))) % 24;
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
const partWord = (d) => { const hr = localHour(d); return hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"; };
const ageText = (min) => min < 60 ? `${min} min ago` : `${Math.round(min / 60)} hr${Math.round(min / 60) === 1 ? "" : "s"} ago`;
const modeLabel = (m) => ({ surf: "Surf", pier: "Pier", inshore: "Inshore" }[m] ?? m);
const VERDICT_WORD = { GO: "GO", MAYBE: "MAYBE", SKIP: "SKIP" };
const VERDICT_SPOKEN = { GO: "Go", MAYBE: "Maybe", SKIP: "Skip" };
const DELTA = { better: "Better tomorrow", similar: "About the same", worse: "Rougher tomorrow" };

function freshness(run, now) {
  const age = Math.max(0, Math.round((now - Date.parse(run.generatedAt)) / 60000));
  const pastValid = now > Date.parse(run.validTo);
  const level = age > STALE_MIN || pastValid ? "stale" : age >= AGING_MIN ? "aging" : "fresh";
  return { age, level, pastValid };
}
function relDay(iso, now) {
  const k = dayKey(iso), n = dayKey(now), y = dayKey(now - 86400000);
  return k === n ? "today" : k === y ? "yesterday" : "earlier";
}

/* ---------- data ---------- */
async function load(file) {
  if (cache.has(file)) return cache.get(file);
  const res = await fetch(file, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  const run = await res.json();
  cache.set(file, run);
  return run;
}
function nowFor(state, run) {
  return state.nowIso ? Date.parse(state.nowIso) : Date.parse(run.generatedAt) + (state.nowOffsetMin ?? 0) * 60000;
}

/* ---------- render: top-level ---------- */
const $ = (id) => document.getElementById(id);
async function setState(id, { animate = true } = {}) {
  const state = STATES.find((x) => x.id === id) ?? STATES[0];
  $("today").setAttribute("aria-busy", "true");
  let run;
  try { run = await load(state.file); }
  catch (e) { renderError(); return; }
  const prev = current?.run?.recommendation?.verdict;
  current = { state, run, now: nowFor(state, run) };
  try { renderToday(animate && prev !== run.recommendation.verdict); }
  catch (e) { console.error(e); renderError(); return; }
  $("today").setAttribute("aria-busy", "false");
  syncReview();
  try { history.replaceState(null, "", `#state=${state.id}${themeParam()}`); } catch {}
}
function renderError() {
  const root = $("today");
  root.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Couldn't read the report"),
    h("p", { class: "muted" }, "Something went wrong reading the report. Try again, or check back in a few minutes."),
    h("button", { class: "btn", type: "button", onclick: () => setState(current?.state.id ?? "go") }, "Try again")));
  root.setAttribute("aria-busy", "false");
}

function renderToday(fade) {
  const { run, state, now } = current;
  const r = run.recommendation;
  const fr = freshness(run, now);
  const stale = fr.level === "stale";
  const offline = !!state.offline;
  const partial = run.status === "partial" || (run.missingInputs?.length ?? 0) > 0;
  const skip = r.verdict === "SKIP";

  renderHero(run, fr, offline);
  renderBanner(run, fr, offline);

  const root = $("today");
  root.classList.toggle("has-banner", !!$("banner-slot").firstChild);
  root.replaceChildren(...[
    renderVerdict(run, fr, stale, fade),
    skip ? renderNext(run, now) : renderBestBet(run, now, stale),
    skip ? null : renderTargets(run),
    skip ? null : renderUse(run),
    renderConfidence(run, partial),
    skip ? renderBackup(run, now) : renderBackup(run, now),
    renderWhy(run),
    renderTimeline(run, now),
    renderTomorrow(run),
    renderSources(run, now),
  ].filter(Boolean));
}

/* ---------- hero + banner ---------- */
function renderHero(run, fr, offline) {
  const chip = $("fresh");
  const t = fmtTime(run.generatedAt);
  let text = `Updated ${t}`, s = "fresh";
  if (offline) { s = "offline"; text = `Offline · ${t}`; }
  else if (fr.level === "aging") { s = "aging"; text = `Updated ${ageText(fr.age)}`; }
  else if (fr.level === "stale") { s = "stale"; text = relDay(run.generatedAt, current.now) === "yesterday" ? `Yesterday ${t}` : `Updated ${t}`; }
  chip.dataset.s = s;
  chip.replaceChildren(text);
  const rb = $("refresh");
  rb.disabled = offline;
  rb.setAttribute("aria-label", offline ? "Refresh unavailable while offline" : "Refresh report");
}
function renderBanner(run, fr, offline) {
  const slot = $("banner-slot");
  slot.replaceChildren();
  if (offline) {
    slot.append(h("div", { class: "banner", role: "status" }, icon("off"), h("div", {},
      h("p", {}, h("b", {}, `Offline — showing the report from ${fmtTime(run.generatedAt)}.`)),
      h("p", {}, "Refresh is paused until you're back online. Everything else still works."))));
  } else if (fr.level === "stale") {
    const when = `${relDay(run.generatedAt, current.now)} ${partWord(run.generatedAt)}`;
    slot.append(h("div", { class: "banner", role: "status" }, icon("warn"), h("div", {},
      h("p", {}, h("b", {}, `This report is from ${when === "earlier evening" ? "an earlier evening" : when}. Pull to refresh.`)),
      h("p", {}, "Windows that have passed are struck through; the next one is shown."))));
  }
}

/* ---------- verdict ---------- */
function renderVerdict(run, fr, stale, fade) {
  const r = run.recommendation;
  const safety = r.gates?.length > 0;
  const ringIcon = r.verdict === "GO" ? "check" : r.verdict === "SKIP" ? (safety ? "shield" : "x") : "wave";
  const C = 2 * Math.PI * 47; // r = 47 (viewBox 112, scaled by CSS)
  const arc = s("circle", { class: "arc", cx: 56, cy: 56, r: 47, "stroke-dashoffset": C });
  const ring = h("div", { class: "ring", "aria-hidden": "true" },
    s("svg", { viewBox: "0 0 112 112" }, s("circle", { class: "track", cx: 56, cy: 56, r: 47 }), arc),
    h("div", { class: "ring-in" }, icon(ringIcon), h("span", { class: "ring-word" }, VERDICT_WORD[r.verdict])));
  // Ring arc is decorative: top suitability. Fills instantly under reduced motion (CSS kills transition).
  const target = C * (1 - Math.max(0, Math.min(100, r.suitability)) / 100);
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute("stroke-dashoffset", target)));

  const focus = r.focus?.speciesName ?? null;
  const caption = stale ? "Last known" : focus ? `for ${focus}` : "";
  const when = r.verdict === "SKIP" ? formatCopyMessage(r.whenLabel) : formatWhenLabel(run, current.now);
  const spoken = `${VERDICT_SPOKEN[r.verdict]}${focus ? ` for ${focus}` : ""}. ${r.verdict === "SKIP" ? formatCopyMessage(r.headline) : `${r.displayName}, ${r.mode}, ${fmtRange(r.window.start, r.window.end)}`}.${stale ? " Last known report." : ""}`;

  const qual = r.amberQualifier ? h("p", { class: "qualifier" }, icon("warn"), formatCopyMessage(r.amberQualifier)) : null;
  const reason = r.verdict !== "GO" && r.reason ? h("p", { class: "reason" }, formatCopyMessage(r.reason.text ?? r.reason)) : null;

  return h("section", { class: `verdict${fade ? " fade" : ""}${stale ? " dim" : ""}`, id: "verdict", "data-v": r.verdict, "aria-live": "polite", "aria-atomic": "true" },
    h("p", { class: "sr-only" }, spoken),
    h("div", { class: "ringbox" }, ring, h("p", { class: "ring-cap", "aria-hidden": "true" }, caption)),
    h("div", { class: "v-copy", "aria-hidden": "false" },
      h("p", { class: "when" }, when),
      h("h1", { class: "headline" }, formatCopyMessage(r.headline)),
      qual, reason));
}

/* ---------- best bet / next best ---------- */
function windowLine(run, now, stale) {
  const r = run.recommendation, w = r.window, st = Date.parse(w.start), en = Date.parse(w.end);
  const range = fmtRange(w.start, w.end);
  if (stale && en < now) {
    const next = (run.days ?? []).flatMap((d) => d.windows ?? []).filter((x) => Date.parse(x.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
    return h("p", { class: "bet-win" }, h("s", {}, range), " ", next ? h("span", { class: "next" }, `Next window ${fmtTime(next.start)}`) : h("span", { class: "next" }, "Window ended"));
  }
  if (now >= st && now < en) return h("p", { class: "bet-win" }, h("strong", {}, `Fish now — until ${fmtTime(w.end)}`));
  if (now < st) return h("p", { class: "bet-win" }, `${range} · `, h("span", { class: "next" }, formatWindowStatus(run, now)));
  return h("p", { class: "bet-win" }, h("s", {}, range), " ", h("span", { class: "next" }, "Window ended"));
}
function renderBestBet(run, now, stale) {
  const r = run.recommendation;
  return h("button", { class: "card bet", type: "button", onclick: () => toast("Spot detail sheet (access, parking, tips) arrives in the real build.") },
    h("div", { class: "bet-main" },
      h("p", { class: "bet-label" }, "Best bet"),
      h("div", { class: "bet-top" }, h("span", { class: "bet-name" }, r.displayName), h("span", { class: "chip mode" }, modeLabel(r.mode))),
      windowLine(run, now, stale)),
    icon("arrow", "go-i"));
}
function renderNext(run, now) {
  const r = run.recommendation, n = r.nextOption;
  const body = n
    ? [h("div", { class: "bet-top" }, h("span", { class: "bet-name" }, n.displayName), h("span", { class: "chip mode" }, modeLabel(n.mode)), n.verdict ? h("span", { class: "chip", "data-v": n.verdict }, VERDICT_SPOKEN[n.verdict]) : null),
       h("p", { class: "bet-win" }, `${relDay(n.window.start, now) === "today" ? "Today" : "Tomorrow"} ${partWord(n.window.start)} · ${fmtRange(n.window.start, n.window.end)}`),
       null]
    : [h("p", { class: "bet-win" }, "Check back later.")];
  return h("section", { class: "card bet", "aria-label": "Next best option" }, h("div", { class: "bet-main" }, h("p", { class: "bet-label" }, "Next best option"), body));
}

/* ---------- targets ---------- */
function renderTargets(run) {
  const r = run.recommendation, targets = (r.targets ?? []).slice(0, 3);
  const list = h("ul", { class: "targets" });
  for (const t of targets) {
    const row = h("li", { class: "t-row" },
      h("span", { class: "t-name" }, t.name, ...(t.tags ?? []).map((g) => h("span", { class: "tag" }, g))),
      h("div", { class: "bar", role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": t.suitability, "aria-label": `${t.name} suitability ${t.suitability}, ${t.band}` }, h("i", { style: `width:${t.suitability}%` })),
      h("span", { class: "t-num" }, t.suitability));
    list.append(row);
    if (session.history) list.append(h("li", { class: "t-hist" }, `${t.name}: ${formatHistoricalRate(t.historicalRate, r.mode)}`));
  }
  const toggle = h("button", { class: "hist-toggle", type: "button", "aria-pressed": String(session.history), onclick: () => { session.history = !session.history; renderToday(false); } },
    "Local history", h("span", { class: "sw", "aria-hidden": "true" }));
  const hint = session.hint
    ? h("div", { class: "hint-row" }, h("p", { class: "hint" }, "Suitability = how well conditions fit each fish. It is not a catch chance."),
        h("button", { type: "button", "aria-label": "Dismiss hint", onclick: () => { session.hint = false; renderToday(false); } }, "×"))
    : null;
  return h("section", { class: "card", "aria-label": "Targets" },
    h("div", { class: "card-h" }, h("h2", {}, "Targets"), h("span", { class: "sub" }, "Suitability"), toggle),
    list, hint);
}

/* ---------- use ---------- */
function renderUse(run) {
  const r = run.recommendation, st = r.setup ?? {};
  const det = h("details", { class: "card", open: session.use || null });
  det.addEventListener("toggle", () => { session.use = det.open; });
  det.append(h("summary", {}, h("span", { class: "use-k" }, "Use"), h("span", { class: "use-t" }, formatCopyMessage(r.useLine)), icon("chev", "chev-i")),
    h("div", { class: "det-body" }, h("dl", {},
      st.where ? h("div", {}, h("dt", {}, "Where"), h("dd", {}, st.where)) : null,
      st.bait?.length ? h("div", {}, h("dt", {}, "Bait"), h("dd", {}, h("ul", {}, st.bait.map((b) => h("li", {}, b))))) : null,
      st.lures?.length ? h("div", {}, h("dt", {}, "Lures"), h("dd", {}, h("ul", {}, st.lures.map((b) => h("li", {}, b))))) : null,
      st.rig ? h("div", {}, h("dt", {}, "Rig"), h("dd", {}, st.rig)) : null),
      h("p", { class: "fine" }, "Check current FWC rules before you go.")));
  return det;
}

/* ---------- confidence ---------- */
function renderConfidence(run, partial) {
  const r = run.recommendation;
  const line = formatConfidence(run); // "High confidence · 82 · summary"
  const [lvl, num, ...rest] = line.split(" · ");
  const levelWord = lvl.replace(" confidence", "");
  const det = h("details", { open: session.conf || null });
  det.addEventListener("toggle", () => { session.conf = det.open; });
  det.append(h("summary", {}, "Why this confidence?", icon("chev", "chev-i")),
    h("ul", {}, (r.confidenceReasons ?? []).map((x) => h("li", {}, formatCopyMessage(x.text)))));
  return h("section", { class: "card conf", "aria-label": "Confidence" },
    h("div", { class: "conf-row" },
      h("p", { class: "conf-line" }, "Confidence: ", h("b", {}, `${levelWord} · ${num}`)),
      partial ? h("span", { class: "chip amber" }, icon("warn"), "Partial data") : null),
    rest.length ? h("p", { class: "conf-sum" }, `Our data: ${rest.join(" · ")}.`) : null,
    (r.confidenceReasons?.length ? det : null));
}

/* ---------- backup ---------- */
function renderBackup(run, now) {
  const b = run.recommendation.backup;
  if (!b) return null;
  const loc = run.locations.find((l) => l.id === b.locationId);
  const outside = b.distanceMi != null && b.distanceMi > 7;
  return h("button", { class: "card bet", type: "button", onclick: () => toast("Tapping a backup makes it Today's scope for this session (real build).") },
    h("div", { class: "bet-main" },
      h("p", { class: "bet-label" }, "Backup"),
      h("div", { class: "bet-top" }, h("span", { class: "bet-name" }, loc?.name ?? b.locationId), b.mode ? h("span", { class: "chip mode" }, modeLabel(b.mode)) : null, h("span", { class: "chip", "data-v": b.verdict }, VERDICT_SPOKEN[b.verdict])),
      h("p", { class: "bet-win next" }, b.reason),
      outside && b.area ? h("p", { class: "fine" }, `In ${b.area}`) : null),
    icon("arrow", "go-i"));
}

/* ---------- why ---------- */
function effectMark(effect, safety) {
  const e = effect === "helps" || effect === "hurts" || effect === "neutral" ? effect : "none";
  const el = h("span", { class: "mk", "data-e": e }, icon(e === "helps" ? "check" : e === "hurts" ? (safety ? "shield" : "down") : e === "neutral" ? "dash" : "dash"));
  if (safety && e === "hurts") el.setAttribute("data-safety", "");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", e === "helps" ? "Helps" : e === "hurts" ? "Hurts" : e === "neutral" ? "Neutral" : "Missing");
  return el;
}
function renderWhy(run) {
  const r = run.recommendation, factors = run._proto?.factors ?? [];
  const safety = (r.gates?.length ?? 0) > 0;
  const list = h("ul", { class: "why" }, (r.why ?? []).map((w) => h("li", {}, effectMark(w.effect, safety && w.effect === "hurts" && w.code === "rain" ? true : false), h("span", {}, formatCopyMessage(w)))));
  const panel = h("ul", { class: "factors", id: "factors", hidden: !session.factors || null });
  for (const f of factors) {
    panel.append(h("li", { class: "f-row" }, effectMark(f.effect, f.limiting && safety),
      h("div", {},
        h("div", { class: "f-top" }, h("span", {}, formatCopyMessage(f.humanLabel)), h("span", {}, f.effect ? ({ helps: "Helps", neutral: "Neutral", hurts: "Hurts" })[f.effect] : "Unavailable")),
        h("div", { class: "f-bar", "aria-hidden": "true" }, h("i", { "data-e": f.effect ?? "none", style: `width:${f.score == null ? 0 : Math.round(f.score * 100)}%` })),
        h("p", { class: "f-det" }, formatCopyMessage(f.detail)))));
  }
  const btn = h("button", { class: "linkbtn", type: "button", "aria-expanded": String(session.factors), "aria-controls": "factors",
    onclick: (e) => { session.factors = !session.factors; const open = session.factors; panel.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open)); e.currentTarget.firstChild.textContent = open ? "Hide factors" : "See all factors"; } },
    session.factors ? "Hide factors" : "See all factors", icon("chev", "chev-i"));
  return h("section", { class: "card", id: "why", "aria-label": "Why" }, h("div", { class: "card-h" }, h("h2", {}, "Why")), list, factors.length ? btn : null, factors.length ? panel : null);
}

/* ---------- timeline ---------- */
function renderTimeline(run, now) {
  const r = run.recommendation, v = r.verdict;
  const row = run.slots?.[0];
  const pts = row?.slots ?? [];
  if (pts.length < 2) return null;
  const W = 340, x0 = 10, x1 = 330, yTop = 24, yBase = 98;
  const t0 = Date.parse(pts[0].at), t1 = Date.parse(pts[pts.length - 1].at), step = (t1 - t0) / (pts.length - 1);
  const X = (t) => x0 + ((t - t0 + step / 2) / (t1 - t0 + step)) * (x1 - x0);
  const bw = ((x1 - x0) / pts.length);
  const svg = s("svg", { class: "tl-svg", viewBox: `0 0 ${W} 150`, role: "img", "data-v": v, style: `--c:var(--${v === "GO" ? "go" : v === "MAYBE" ? "mid" : "skip"})` });
  const cl = s("title", {}, "Next 30 hours: suitability, tide and light");
  svg.append(cl);
  // light band
  const sunrise = (run._proto?.light?.sunrise ?? []).map(Date.parse), sunset = (run._proto?.light?.sunset ?? []).map(Date.parse);
  const bandY = 112, bandH = 7;
  svg.append(s("rect", { class: "night", x: x0, y: bandY, width: x1 - x0, height: bandH, rx: 3 }));
  const dayRanges = [];
  for (const rise of sunrise) { const set = sunset.find((z) => z > rise); if (set) dayRanges.push([rise, set]); }
  for (const set of sunset) { if (!dayRanges.some(([, z]) => z === set) && set > t0) dayRanges.push([t0, set]); }
  for (const [a, b] of dayRanges) { const xa = Math.max(x0, X(a)), xb = Math.min(x1, X(b)); if (xb > xa) svg.append(s("rect", { class: "day", x: xa, y: bandY, width: xb - xa, height: bandH, rx: 3 })); }
  // gates (safety) first, then windows
  const gates = [...(r.gates ?? []), ...(r.window?.gates ?? [])];
  for (const g of gates) if (g.startsAt && g.endsAt) {
    const xa = Math.max(x0, X(Date.parse(g.startsAt))), xb = Math.min(x1, X(Date.parse(g.endsAt)));
    if (xb > xa) { svg.append(s("rect", { class: "gate", x: xa, y: yTop - 8, width: xb - xa, height: yBase - yTop + 8, rx: 5 })); svg.append(s("text", { x: (xa + xb) / 2, y: yTop + 6, "text-anchor": "middle", class: "lbl-strong", style: "fill:var(--skip)" }, "Storms")); }
  }
  // grid + hour labels every 6h local
  const labelled = [];
  pts.forEach((p, i) => { const hr = localHour(p.at); if (hr % 6 === 0) labelled.push([i, p.at, hr]); });
  for (const [i, at, hr] of labelled) {
    const x = x0 + i * bw + bw / 2;
    svg.append(s("line", { class: "grid", x1: x, x2: x, y1: yTop - 4, y2: yBase }));
    svg.append(s("text", { x, y: 133, "text-anchor": "middle" }, hr === 0 ? "12 AM" : hr === 12 ? "12 PM" : hr < 12 ? `${hr} AM` : `${hr - 12} PM`));
  }
  // suitability bars
  pts.forEach((p, i) => {
    if (p.suitability == null) return;
    const hgt = (p.suitability / 100) * (yBase - yTop);
    svg.append(s("rect", { class: "sbar", x: x0 + i * bw + 1, y: yBase - hgt, width: Math.max(1, bw - 2), height: hgt, rx: 2, opacity: (0.28 + 0.62 * p.suitability / 100).toFixed(2) }));
  });
  // windows
  const wins = [{ ...r.window, primary: true }];
  for (const d of run.days ?? []) for (const w of d.windows ?? []) if (!wins.some((z) => z.start === w.start)) wins.push({ ...w });
  for (const w of wins) {
    const a = Date.parse(w.start), b = Date.parse(w.end);
    if (b < t0 || a > t1 || (v === "SKIP" && w.primary)) continue;
    const xa = Math.max(x0, X(a)), xb = Math.min(x1, X(b));
    svg.append(s("rect", { class: `win${w.primary ? "" : " alt"}`, x: xa, y: yTop - 6, width: Math.max(4, xb - xa), height: yBase - yTop + 10, rx: 5 }));
    if (w.primary || v === "SKIP") {
      const cx = Math.min(Math.max((xa + xb) / 2, x0 + 28), x1 - 28);
      svg.append(s("text", { x: cx, y: 12, "text-anchor": "middle", class: "lbl-strong" }, w.primary ? "Best window" : "Next window"));
    }
  }
  // tide curve
  const tideOk = pts.filter((p) => p.tide?.heightFt != null);
  if (tideOk.length > 3) {
    const lo = 0, hi = 5;
    const d = pts.map((p, i) => p.tide?.heightFt == null ? null : `${i === 0 ? "M" : "L"}${(x0 + i * bw + bw / 2).toFixed(1)},${(yBase - ((p.tide.heightFt - lo) / (hi - lo)) * (yBase - yTop)).toFixed(1)}`).filter(Boolean).join(" ");
    svg.append(s("path", { class: "tide", d }));
  }
  // now marker
  if (now >= t0 && now <= t1) { const xn = X(now); svg.append(s("line", { class: "nowline", x1: xn, x2: xn, y1: yTop - 8, y2: bandY + bandH + 2 })); }
  // sunrise / sunset ticks
  const sun = [...sunrise.map((t) => [t, "Sunrise"]), ...sunset.map((t) => [t, "Sunset"])].filter(([t]) => t >= t0 && t <= t1);
  for (const [t, n] of sun) svg.append(s("text", { x: X(t), y: 147, "text-anchor": "middle", style: "font-size:9px" }, `${n} ${fmtTime(t)}`));

  const events = (row.tideEvents ?? []).slice(0, 4).map((e) => `${e.type === "high" ? "High" : "Low"} ${fmtTime(e.at)}`).join(" · ");
  const winSummary = wins.filter((w) => !(v === "SKIP" && w.primary)).map((w) => `${w.primary ? "Best window" : "Next window"} ${fmtRange(w.start, w.end)}`).join("; ");
  svg.setAttribute("aria-label", `Next 30 hours. ${winSummary || "No window today"}. ${events ? "Tide: " + events + "." : "Tide timing unavailable."}`);

  return h("section", { class: "card", "aria-label": "Best times" },
    h("div", { class: "card-h" }, h("h2", {}, "Best times"), h("span", { class: "sub" }, "Next 30 hours")),
    h("div", { class: "tl-wrap" }, svg),
    h("div", { class: "tl-legend", "aria-hidden": "true" }, h("span", {}, h("i", {}), "Suitability"), tideOk.length > 3 ? h("span", {}, h("i", { class: "t" }), "Tide") : null, h("span", {}, h("i", { class: "d" }), "Daylight"), h("span", {}, h("i", { class: "w" }), "Window"), h("span", {}, h("i", { class: "n" }), "Now")),
    h("p", { class: "tl-cap" }, tideOk.length > 3 ? events : "Tide timing is unavailable, so the tide line is hidden."));
}

/* ---------- tomorrow vs today ---------- */
function renderTomorrow(run) {
  const d = run.days ?? [];
  if (d.length < 2) return null;
  const cmp = run.recommendation.comparison?.kind;
  const card = (label, day) => {
    const w = day.windows?.[0];
    return h("div", { class: "tv-c" },
      h("p", { class: "k" }, label, h("span", { class: "chip", "data-v": day.verdict }, VERDICT_SPOKEN[day.verdict])),
      w ? h("p", { class: "w" }, fmtRange(w.start, w.end)) : h("p", { class: "w" }, "No good window"),
      w ? h("p", { class: "s" }, `${w.displayName ?? ""} · ${partWord(w.start)}`) : h("p", { class: "s" }, formatCopyMessage(day.reason)));
  };
  return h("section", { class: "card", "aria-label": "Today versus tomorrow" },
    h("div", { class: "card-h" }, h("h2", {}, "Today vs tomorrow")),
    h("div", { class: "tv" }, card("Today", d[0]), card("Tomorrow", d[1])),
    cmp ? h("p", { class: "delta" }, DELTA[cmp]) : null);
}

/* ---------- data & sources (L3) ---------- */
function renderSources(run, now) {
  const det = h("details", { class: "card", open: session.sources || null, id: "sources" });
  det.addEventListener("toggle", () => { session.sources = det.open; });
  const srcs = run.inputs?.sourceStatus ?? [];
  const missing = srcs.filter((x) => x.available === false);
  const items = srcs.map((x) => h("li", { "data-bad": x.available === false ? "" : null }, h("span", {}, x.label ?? x.kind),
    h("span", {}, x.available === false ? "Unavailable" : `${x.status === "current" ? "Current" : "Stale"} · ${fmtTime(x.fetchedAt)}`)));
  const factors = run._proto?.factors ?? [];
  const table = factors.length ? h("table", { class: "l3" },
    h("caption", { class: "sr-only" }, "Factor values, scores and weights"),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Factor"), h("th", { scope: "col" }, "Value"), h("th", { scope: "col" }, "Score"), h("th", { scope: "col" }, "Weight"))),
    h("tbody", {}, factors.map((f) => h("tr", {}, h("th", { scope: "row", style: "font-weight:500" }, f.label),
      h("td", {}, f.value == null || typeof f.value === "string" ? "—" : `${+f.value.toFixed(2)}${f.unit ? " " + f.unit : ""}`),
      h("td", {}, f.score == null ? "—" : f.score.toFixed(2)), h("td", {}, f.weight == null ? "—" : f.weight.toFixed(2)))))) : null;
  det.append(h("summary", {}, h("span", { class: "use-t" }, "Data & sources"), missing.length ? h("span", { class: "chip amber" }, `${missing.length} missing`) : null, icon("chev", "chev-i")),
    h("div", { class: "det-body" },
      h("ul", { class: "src" }, items),
      missing.length ? h("p", { class: "fine" }, `Missing right now: ${missing.map((m) => (m.label ?? m.kind).toLowerCase()).join(", ")}.`) : null,
      table,
      h("p", { class: "fine" }, `Model ${run.modelVersion} · run ${fmtTime(run.generatedAt)} · all times Eastern. Illustrative prototype data.`)));
  return det;
}

/* ---------- tabs, stubs, toast, review ---------- */
let toastTimer;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600); }
const STUBS = {
  spots: ["Spots", "Ranked spot list with verdict chips, favourites, Near me and mode filter."],
  species: ["Species", "Grid of species sorted by current suitability, with the species sheet and Target this."],
  plan: ["Plan", "7-day planner: two real days, then Promising / Mixed / Tough outlook rows."],
};
function setTab(name) {
  tab = name;
  document.querySelectorAll(".tab").forEach((b) => { if (b.dataset.tab === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const stub = name !== "today";
  $("today").hidden = stub; $("stub").hidden = !stub; $("banner-slot").hidden = stub;
  if (stub) { $("stub-title").textContent = STUBS[name][0]; $("stub-text").textContent = `Prototype stub — only Today has content here. ${STUBS[name][1]}`; }
  window.scrollTo({ top: 0 });
}
function themeParam() { const t = document.documentElement.dataset.theme; return t ? `&theme=${t}` : ""; }
function setTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { history.replaceState(null, "", `#state=${current?.state.id ?? "go"}${themeParam()}`); } catch {}
  syncReview();
}
function syncReview() {
  document.querySelectorAll("#review-states button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === current?.state.id)));
  const t = document.documentElement.dataset.theme ?? "auto";
  document.querySelectorAll("#review-themes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === t)));
}
function initReview() {
  const sl = $("review-states");
  for (const st of STATES) sl.append(h("button", { type: "button", "data-id": st.id, "aria-pressed": "false", onclick: () => { setTab("today"); setState(st.id); } }, st.label));
  const tl = $("review-themes");
  for (const [id, label] of THEMES) tl.append(h("button", { type: "button", "data-id": id, "aria-pressed": "false", onclick: () => setTheme(id) }, label));
  const btn = $("review-btn"), panel = $("review-panel");
  btn.addEventListener("click", () => { const open = panel.hidden; panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
}

function init() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  $("stub-back").addEventListener("click", () => setTab("today"));
  $("spot-pill").addEventListener("click", () => toast("Spot picker sheet arrives in the real build. Scope here: Best anywhere."));
  $("seg-tomorrow").addEventListener("click", () => toast("Tomorrow uses the same layout with a tomorrow run. Not wired in this prototype."));
  $("refresh").addEventListener("click", () => {
    const chip = $("fresh"); const prev = chip.textContent; const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    chip.replaceChildren(rm ? null : h("span", { class: "spin" }), "Updating…");
    setTimeout(() => { if (current) renderHero(current.run, freshness(current.run, current.now), !!current.state.offline); else chip.textContent = prev; }, 900);
  });
  initReview();
  const params = new URLSearchParams(location.hash.slice(1));
  const theme = params.get("theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  // loading, no cache: skeleton, never spinner-only
  $("today").replaceChildren(h("div", { class: "skel", style: "height:150px;margin-top:-34px;position:relative", "aria-label": "Reading the water…" }), h("div", { class: "skel", style: "height:70px;margin-top:10px" }), h("div", { class: "skel", style: "height:112px;margin-top:10px" }));
  setState(params.get("state") ?? "go", { animate: false });
}
init();
