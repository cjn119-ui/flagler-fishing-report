// 7-day fishing outlook from the NWS daily forecast. Shared by v3 and flagler-fishing.
import { verdict, parseWindMph, localDay } from "../v2/logic.js?v=calc-20260930";

export const GRID_FORECAST = "https://api.weather.gov/gridpoints/JAX/89,29/forecast";

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Missing dimensions are excluded, then the remaining declared weights normalize.
export function weightedScore(dimensions) {
  const known = dimensions.filter(d => Number.isFinite(d.value));
  const weight = known.reduce((sum, d) => sum + d.weight, 0);
  return weight ? Math.round(100 * known.reduce((sum, d) => sum + clamp01(d.value) * d.weight, 0) / weight) : null;
}
const windQuality = value => Number.isFinite(value) && value >= 0 ? clamp01(1 - (value - 5) / 20) : null;
const rainQuality = value => Number.isFinite(value) && value >= 0 && value <= 100 ? 1 - value / 100 : null;

/** Daily score uses forecast wind 55%, rain 45%; absent values are never guessed. */
export function dayScore(windMph, rainPct) {
  return weightedScore([{ value: windQuality(windMph), weight: .55 }, { value: rainQuality(rainPct), weight: .45 }]);
}

/** Status bands apply AFTER the raw weighted score. Alerts/gusts can cap it. */
export const BANDS = [[70, 100], [40, 69], [0, 39]];
export const bandScore = (level, raw) => raw == null ? null : level == null ? raw : Math.max(BANDS[level][0], Math.min(BANDS[level][1], raw));

/** Current score: wind 45%, rain 35%, seas 20%; weights normalize for missing data. */
export function nowScore({ windMph = null, rainPct = null, seasM = null }, level) {
  return bandScore(level, weightedScore([
    { value: windQuality(windMph), weight: .45 },
    { value: rainQuality(rainPct), weight: .35 },
    { value: Number.isFinite(seasM) && seasM >= 0 ? clamp01(1 - (seasM - .5) / 1.5) : null, weight: .20 },
  ]));
}

/**
 * periods: NWS /forecast periods (12 h each, alternating day/night).
 * Groups by New York calendar day. The daytime period drives wind/rain; a lone "Tonight" is used for today.
 */
export function weeklyOutlook(periods, days = 7, { today } = {}) {
  const byDay = new Map();
  for (const p of periods) {
    const key = localDay(new Date(p.startTime));
    const d = byDay.get(key) ?? { day: key, day_p: null, night_p: null };
    if (p.isDaytime) d.day_p ??= p; else d.night_p ??= p;
    byDay.set(key, d);
  }
  return [...byDay.values()].filter(d => !today || d.day >= today).sort((a, b) => a.day.localeCompare(b.day)).slice(0, days).map((d) => {
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
