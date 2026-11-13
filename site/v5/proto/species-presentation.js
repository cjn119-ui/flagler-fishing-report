export function bestSpeciesCandidate(candidates = []) {
  const realistic = candidates.filter((candidate) => candidate?.eligibility === "realistic");
  return [...(realistic.length ? realistic : candidates)].sort((a, b) => (b?.suitability ?? -1) - (a?.suitability ?? -1))[0] ?? null;
}

export function speciesEligibilityLabel(candidate) {
  if (!candidate || candidate.eligibility === "realistic") return "";
  const code = candidate.eligibilityReason?.code;
  return ({ belowRealisticFloor: "Uncommon here", historyUnavailable: "No survey data", notOnSpotList: "Not a target at these spots", structureRequired: "Needs structure", bycatch: "Bycatch", closedForConstruction: "Closed for construction" })[code]
    ?? ({ rare: "Uncommon here", "off-list": "Not a target at these spots", "no-structure": "Needs structure", bycatch: "Bycatch", closed: "Closed for construction" })[candidate.eligibility]
    ?? "Eligibility limited";
}

export function speciesTripRate(candidate) {
  const rate = candidate?.historicalRate;
  if (!Number.isFinite(rate?.rate)) return "";
  const month = rate.monthName ? rate.monthName.slice(0, 3) : new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2020, (rate.month ?? 1) - 1, 1)));
  const label = Math.round(rate.rate * 100) === 0 ? `Rarely caught in ${month}` : `~${Math.round(rate.rate * 100)}% of ${month} trips`;
  return `${label}${rate.lowSample ? " · few surveys" : ""}`;
}

// A safety cap pins every score at the same value (49), which reads like a real ranking; say what it is instead.
export const unsafeCapped = (row) => (row?.caps ?? []).some((x) => x?.code === "severeConditions");
export function speciesFitWord(suitability, row = null) {
  if (unsafeCapped(row)) return "Unsafe conditions";
  return suitability == null ? "No fit reading" : suitability >= 70 ? "Great" : suitability >= 50 ? "Decent" : suitability >= 30 ? "Poor" : "Not a fit";
}
export function speciesFitBand(suitability, row = null) {
  if (unsafeCapped(row)) return "Unsafe conditions";
  return suitability == null ? "No fit reading" : `${suitability >= 70 ? "Great" : suitability >= 50 ? "Decent" : suitability >= 30 ? "Poor" : "Not a"} conditions fit`;
}
