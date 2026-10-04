// Seasonal targets for St. Johns/Flagler from FWC. These are habitat and season
// matches, not catch-frequency estimates or a statement about legal harvest.
const species = {
  surf: [
    { name: "Whiting", months: null },
    { name: "Pompano", months: [3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { name: "Croaker", months: [9, 10, 11] },
    { name: "Bluefish", months: [12, 1, 2] },
    { name: "Spanish mackerel", months: [9, 10, 11, 12, 1, 2, 3, 4, 5] },
  ],
  inshore: [
    { name: "Redfish", months: [9, 10, 11, 12, 1, 2] },
    { name: "Spotted seatrout", months: [9, 10, 11, 12, 1, 2] },
    { name: "Black drum", months: [9, 10, 11, 12, 1, 2, 3, 4, 5] },
    { name: "Flounder", months: [3, 4, 5, 9, 10, 11] },
    { name: "Jack crevalle", months: [3, 4, 5, 6, 7, 8, 9, 10, 11] },
  ],
};

export function seasonalTargets(habitat, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];
  return (species[habitat] ?? []).filter(s => s.months === null || s.months.includes(month)).slice(0, 3).map(s => s.name);
}

// Relative bite potential for the strongest fully covered two-hour window.
// The bands are editorial thresholds over the documented heuristic, not
// calibrated probabilities of a catch.
export function biteOutlook(windows) {
  const best = windows[0];
  if (!best || !Number.isFinite(best.score)) return null;
  return {
    window: best,
    label: best.score >= .78 ? "Promising" : best.score >= .62 ? "Mixed" : "Slow",
    level: best.score >= .78 ? "promising" : best.score >= .62 ? "mixed" : "slow",
  };
}

// Same URL main.js and the service worker use, so the module is shared and precached. Keep in step with their ?v= string.
import { RULES } from "./logic.js?v=catch-20260930b";

const HOUR = 3600e3, MIN = 60e3;
const ageMs = (at, now) => at instanceof Date && Number.isFinite(+at) ? Math.max(0, now - at) : null;

// First wind/rain reading that sits just under a caution or skip line (within 15%), where a small forecast miss changes the call.
function nearThreshold(window) {
  for (const [name, value, rule, unit] of [["Wind", window.windMph, RULES.wind, " mph"], ["Rain chance", window.rainPct, RULES.rain, "%"]]) {
    if (!Number.isFinite(value)) continue;
    for (const [line, limit] of [["caution", rule.marginal], ["skip", rule.skip]]) {
      if (value < limit && value >= limit * 0.85) return `${name} ${Math.round(value)}${unit} is near the ${limit}${unit} ${line} line.`;
    }
  }
  return null;
}

/**
 * How far the inputs behind a bite outlook can be trusted: freshness, completeness and forecast
 * uncertainty, never a catch probability. Each gap adds a point (a severe one adds three);
 * 0 = High, 1-2 = Moderate, 3+ = Low.
 *   severe: forecast over 6 h old, alerts unverified, inshore tide predictions unavailable
 *   one point: forecast 3-6 h old or issue time unknown, surf with no/aging (>90 min) offshore reading,
 *     no airport observation, best window more than 12 h away, window wind/rain just under a caution
 *     or skip line, airport wind well off the forecast
 * inputs: { spot, now, forecastUpdated: Date|null, alertsKnown, tidesOk, buoyAt: Date|null, obsAt: Date|null,
 *   window: best window {start, windMph, rainPct}|null, obsWindMph, forecastWindMph }
 * (buoyAt/obsAt are null when the reading is missing or too old to use.)
 */
export function biteConfidence({ spot, now, forecastUpdated, alertsKnown, tidesOk, buoyAt, obsAt, window = null, obsWindMph = null, forecastWindMph = null }) {
  const issues = [];
  const note = (points, text) => issues.push({ points, text });
  const fAge = ageMs(forecastUpdated, now);
  if (fAge == null) note(1, "Forecast issue time unknown.");
  else if (fAge > 6 * HOUR) note(3, `Forecast is ${Math.round(fAge / HOUR)} h old.`);
  else if (fAge > 3 * HOUR) note(1, `Forecast is ${Math.round(fAge / HOUR)} h old.`);
  if (!alertsKnown) note(3, "Current alerts unverified.");
  if (spot === "inshore" && !tidesOk) note(3, "Tide predictions unavailable.");
  if (spot === "surf") {
    const bAge = ageMs(buoyAt, now);
    if (bAge == null) note(1, "No recent offshore reading.");
    else if (bAge > 90 * MIN) note(1, `Offshore reading is ${Math.round(bAge / MIN)} min old.`);
  }
  if (ageMs(obsAt, now) == null) note(1, "No recent airport observation.");
  if (window) {
    const hoursOut = (window.start - now) / HOUR;
    if (hoursOut > 12) note(1, `Best window starts in ${Math.round(hoursOut)} h; forecasts firm up closer in.`);
    const near = nearThreshold(window);
    if (near) note(1, near);
  }
  if (Number.isFinite(obsWindMph) && Number.isFinite(forecastWindMph)) {
    // forecastWindMph is the top of NWS's range, so a calm airport reading under it is normal; only large misses count.
    const diff = obsWindMph - forecastWindMph;
    if (diff > 5) note(1, `Airport wind (${Math.round(obsWindMph)} mph) is above the forecast (${Math.round(forecastWindMph)} mph).`);
    else if (diff < -12) note(1, `Airport wind (${Math.round(obsWindMph)} mph) is well below the forecast (${Math.round(forecastWindMph)} mph).`);
  }
  const points = issues.reduce((sum, i) => sum + i.points, 0);
  const level = points >= 3 ? "low" : points >= 1 ? "moderate" : "high";
  return { level, label: `${level[0].toUpperCase()}${level.slice(1)} confidence`, reasons: issues.map((i) => i.text) };
}
