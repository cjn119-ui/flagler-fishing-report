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

// Catch likelihood (0-100 index, not a % chance): geometric blend of the survey base rate (share of trips that caught the
// species this month, from MRIP) and today's conditions fit from the engine. Needs both; never invents a value.
// Weights and the 40% rate ceiling are provisional product choices, kept in one place so they are easy to retune.
export const CATCH_SCORE = { rateWeight: 0.6, fitWeight: 0.4, rateCeiling: 0.4 };
export function catchScore(candidate, row = null) {
  if (!candidate || unsafeCapped(row ?? candidate)) return null;
  const rate = candidate.historicalRate?.rate, fit = candidate.suitability;
  if (!Number.isFinite(rate) || !Number.isFinite(fit)) return null;
  const r = Math.min(1, Math.max(0, rate) / CATCH_SCORE.rateCeiling), f = Math.min(1, Math.max(0, fit) / 100);
  const score = Math.round(100 * Math.pow(r, CATCH_SCORE.rateWeight) * Math.pow(f, CATCH_SCORE.fitWeight));
  return { score, level: catchLevel(score), lowSample: !!candidate.historicalRate?.lowSample, rate, fit };
}
export const catchLevel = (score) => score >= 65 ? "High" : score >= 40 ? "Moderate" : score >= 20 ? "Low" : "Very low";
