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
