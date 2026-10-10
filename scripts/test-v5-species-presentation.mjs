import assert from "node:assert/strict";
import { bestSpeciesCandidate, speciesEligibilityLabel, speciesFitBand, speciesTripRate } from "../site/v5/proto/species-presentation.js";

const candidates = [
  { speciesId: "sheepshead", locationId: "staug-pier", mode: "pier", suitability: 20, eligibility: "realistic", historicalRate: { rate: 0.15, month: 10, lowSample: true } },
  { speciesId: "sheepshead", locationId: "beach", mode: "surf", suitability: 89, eligibility: "off-list", eligibilityReason: { code: "notOnSpotList" } },
];
assert.equal(bestSpeciesCandidate(candidates), candidates[0], "prefer the best realistic candidate over a higher fit off-list candidate");
assert.equal(speciesEligibilityLabel(candidates[1]), "Not on our spot lists");
assert.doesNotMatch(speciesEligibilityLabel(candidates[1]), /rare/i, "off-list must never be labelled Rare");
assert.equal(speciesFitBand(76), "Great conditions fit", "show the fit word on dimmed cards");
assert.equal(speciesTripRate(candidates[0]), "Caught on ~15% of Oct trips · small sample");
assert.equal(bestSpeciesCandidate([candidates[1]]), candidates[1], "fall back to the best candidate only when no realistic candidate exists");
console.log("v5 species presentation: passed realistic-first selection, reason labels, fit wording, and historical trip rate.");
