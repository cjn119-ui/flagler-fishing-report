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

const HOUR = 3600e3, MIN = 60e3;
const ageMs = (at, now) => at instanceof Date && Number.isFinite(+at) ? Math.max(0, now - at) : null;

/**
 * How far the inputs behind a bite outlook can be trusted: freshness and completeness only, never a
 * catch probability. A severe gap (stale forecast, unverified alerts, no tide predictions) drops it to
 * Low; otherwise one minor gap is Moderate and two or more are Low.
 * inputs: { spot, now, forecastUpdated: Date|null, alertsKnown, tidesOk, buoyAt: Date|null, obsAt: Date|null }
 * (buoyAt/obsAt are null when the reading is missing or too old to use.)
 */
export function biteConfidence({ spot, now, forecastUpdated, alertsKnown, tidesOk, buoyAt, obsAt }) {
  const issues = [];
  const note = (severe, text) => issues.push({ severe, text });
  const fAge = ageMs(forecastUpdated, now);
  if (fAge == null) note(false, "Forecast issue time unknown.");
  else if (fAge > 6 * HOUR) note(true, `Forecast is ${Math.round(fAge / HOUR)} h old.`);
  else if (fAge > 3 * HOUR) note(false, `Forecast is ${Math.round(fAge / HOUR)} h old.`);
  if (!alertsKnown) note(true, "Current alerts unverified.");
  if (spot === "inshore" && !tidesOk) note(true, "Tide predictions unavailable.");
  if (spot === "surf") {
    const bAge = ageMs(buoyAt, now);
    if (bAge == null) note(false, "No recent offshore reading.");
    else if (bAge > 90 * MIN) note(false, `Offshore reading is ${Math.round(bAge / MIN)} min old.`);
  }
  if (ageMs(obsAt, now) == null) note(false, "No recent airport observation.");
  const level = issues.some((i) => i.severe) || issues.length >= 2 ? "low" : issues.length === 1 ? "moderate" : "high";
  return { level, label: `${level[0].toUpperCase()}${level.slice(1)} confidence`, reasons: issues.map((i) => i.text) };
}
