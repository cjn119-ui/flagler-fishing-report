// 7-day fishing outlook from the NWS daily forecast. Shared by v3 and flagler-fishing.
import { verdict, parseWindMph, localDay } from "../v2/logic.js";

export const GRID_FORECAST = "https://api.weather.gov/gridpoints/JAX/87,28/forecast";

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** 0-100 from wind and rain chance only: wind <=5 mph is full marks, >=25 mph is zero; rain chance subtracts linearly. */
export function dayScore(windMph, rainPct) {
  const w = windMph == null ? 0.6 : clamp01(1 - (windMph - 5) / 20);
  const r = rainPct == null ? 0.7 : clamp01(1 - rainPct / 100);
  return Math.round(100 * (0.55 * w + 0.45 * r));
}

/** Score bands so a bar's height always agrees with its Go / Marginal / Skip color. */
export const BANDS = [[70, 100], [40, 69], [0, 39]];
export const bandScore = (level, raw) => (level == null ? raw : Math.max(BANDS[level][0], Math.min(BANDS[level][1], raw)));

/** Overall "now" score: wind 45%, rain 35%, offshore seas 20% (weights renormalize if seas is unknown). */
export function nowScore({ windMph = null, rainPct = null, seasM = null }, level) {
  const w = windMph == null ? 0.6 : clamp01(1 - (windMph - 5) / 20);
  const r = rainPct == null ? 0.7 : clamp01(1 - rainPct / 100);
  const raw = seasM == null ? 100 * (0.55 * w + 0.45 * r) : 100 * (0.45 * w + 0.35 * r + 0.2 * clamp01(1 - (seasM - 0.5) / 1.5));
  return bandScore(level, Math.round(raw));
}

/**
 * periods: NWS /forecast periods (12 h each, alternating day/night).
 * Groups by New York calendar day. The daytime period drives wind/rain; a lone "Tonight" is used for today.
 */
export function weeklyOutlook(periods, days = 7) {
  const byDay = new Map();
  for (const p of periods) {
    const key = localDay(new Date(p.startTime));
    const d = byDay.get(key) ?? { day: key, day_p: null, night_p: null };
    if (p.isDaytime) d.day_p ??= p; else d.night_p ??= p;
    byDay.set(key, d);
  }
  return [...byDay.values()].slice(0, days).map((d) => {
    const main = d.day_p ?? d.night_p;
    const wind = parseWindMph(main.windSpeed);
    const rain = main.probabilityOfPrecipitation?.value ?? null;
    const hi = d.day_p?.temperature ?? null, lo = d.night_p?.temperature ?? null;
    const v = verdict({ windMph: wind, rainPct: rain });
    if (v.level === 0 && (wind == null || rain == null)) {
      v.level = null; v.label = "Unknown"; v.reasons = ["Wind or rain forecast missing."];
    }
    return { day: d.day, wind, rain, hi, lo, short: main.shortForecast, score: v.level == null ? null : bandScore(v.level, dayScore(wind, rain)), verdict: v };
  });
}

/** Builds the bar chart into `root`. Styling lives in each version's CSS (classes wk-*). */
export function renderWeek(root, days, { today } = {}) {
  root.replaceChildren();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const list = el("ol", "wk-bars");
  days.forEach((d, i) => {
    const date = new Date(`${d.day}T12:00:00Z`);
    const name = i === 0 && d.day === today ? "Today" : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date);
    const lvl = d.verdict.level ?? "none";
    const li = el("li", "wk-col");
    li.dataset.level = lvl;
    li.setAttribute("aria-label", `${name}: ${d.verdict.label}, score ${d.score ?? "unknown"} of 100, wind ${d.wind == null ? "unknown" : `up to ${Math.round(d.wind)} mph`}, rain ${d.rain == null ? "unknown" : `${Math.round(d.rain)} percent`}`);
    const track = el("div", "wk-track");
    const bar = el("div", "wk-bar"); bar.style.height = `${d.score == null ? 0 : Math.max(d.score, 6)}%`;
    track.append(bar);
    li.append(el("span", "wk-score", d.score == null ? "–" : String(d.score)), track, el("b", "wk-day", name), el("span", "wk-label", d.verdict.label), el("span", "wk-meta", d.wind == null ? "– mph" : `${Math.round(d.wind)} mph`), el("span", "wk-meta", d.rain == null ? "– %" : `${Math.round(d.rain)}%`));
    list.append(li);
  });
  root.append(list);
}
