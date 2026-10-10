export function bestSpeciesCandidate(candidates = []) {
  const realistic = candidates.filter((candidate) => candidate?.eligibility === "realistic");
  return [...(realistic.length ? realistic : candidates)].sort((a, b) => (b?.suitability ?? -1) - (a?.suitability ?? -1))[0] ?? null;
}

export function speciesEligibilityLabel(candidate) {
  if (!candidate || candidate.eligibility === "realistic") return "";
  const code = candidate.eligibilityReason?.code;
  return ({ belowRealisticFloor: "Rarely caught", historyUnavailable: "No survey data", notOnSpotList: "Not on our spot lists", structureRequired: "Needs structure", bycatch: "Bycatch" })[code]
    ?? ({ rare: "Rarely caught", "off-list": "Not on our spot lists", "no-structure": "Needs structure", bycatch: "Bycatch" })[candidate.eligibility]
    ?? "Eligibility limited";
}

export function speciesTripRate(candidate) {
  const rate = candidate?.historicalRate;
  if (!Number.isFinite(rate?.rate)) return "";
  const month = rate.monthName ?? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2020, (rate.month ?? 1) - 1, 1)));
  return `Caught on ~${Math.round(rate.rate * 100)}% of ${month} trips${rate.lowSample ? " · small sample" : ""}`;
}

export function speciesFitBand(suitability) {
  return suitability == null ? "No fit reading" : `${suitability >= 70 ? "Great" : suitability >= 50 ? "Decent" : suitability >= 30 ? "Poor" : "Not a" } conditions fit`;
}
