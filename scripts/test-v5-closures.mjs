import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";
import { SPECIES } from "../site/v5/species.js";
import { classifyEligibility, scoreSpecies } from "../site/v5/engine/model.js";
import { loadFirstCoastHistory } from "../site/v5/engine/history.js";
import { buildPredictionRun } from "../site/v5/engine/run.js";
import { isModeClosed, openModes, openModeRows } from "../site/v5/proto/closure-presentation.js";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("scripts/fixtures/v5/run-inputs.json", root), "utf8"));
const history = await loadFirstCoastHistory({ readJson: async () => JSON.parse(await readFile(new URL("site/v5/data/first-coast-history.json", root), "utf8")) });
const ids = ["flagler-pier", "staug-pier"];
const pierSpots = ACTIVE_SPOTS.filter((spot) => ids.includes(spot.id));

for (const spot of pierSpots) {
  const closure = spot.closures?.find((item) => item.status === "closed" && item.modes.includes("pier"));
  assert.ok(closure, `${spot.id} has a cataloged pier closure`);
  assert.equal(isModeClosed(spot.id, "pier"), true);
  assert.equal(isModeClosed(spot.id, "surf"), false, `${spot.id} surf remains open`);
  assert.deepEqual(openModes(spot.id, spot.modes), ["surf"]);
  const species = SPECIES.find((item) => item.modes.includes("pier") && spot.targets.includes(item.id));
  const closed = classifyEligibility({ species, spot, mode: "pier", rate: .5, historyAvailable: true });
  assert.deepEqual(closed, { eligibility: "closed", eligibilityReason: { code: "closedForConstruction" } });
  const open = classifyEligibility({ species, spot, mode: "surf", rate: .5, historyAvailable: true });
  assert.notEqual(open.eligibility, "closed", `${spot.id} surf keeps normal eligibility`);
  const score = scoreSpecies({ species, spot, mode: "pier", history, slots: [fixture.now], now: fixture.now, conditionsAt: () => { throw new Error("closed mode must not score conditions"); } });
  assert.deepEqual(score.slots, []);
  assert.deepEqual(score.windows, []);
}

const legacyCandidates = ids.flatMap((locationId) => [
  { locationId, mode: "pier", id: `${locationId}:pier` },
  { locationId, mode: "surf", id: `${locationId}:surf` },
]);
assert.deepEqual(openModeRows(legacyCandidates).map((row) => row.id), ids.map((id) => `${id}:surf`), "client filtering removes old pier candidates from already-generated runs");

const built = await buildPredictionRun({ now: fixture.now, locations: ACTIVE_SPOTS, species: SPECIES, history, observations: fixture.observations, catalogHash: "closure-fixture", codeRevision: "closure-test" });
for (const run of [built.today, built.tomorrow]) {
  assert.equal(run.candidates.filter((row) => ids.includes(row.locationId) && row.mode === "pier").length, 0, `${run.horizon} has no pier-mode windows at closed piers`);
  assert.ok(run.scopeViews.byLocation["flagler-pier:surf"]?.recommendation, "default spot remains available in surf mode");
  assert.equal(run.scopeViews.byLocation["flagler-pier:surf"].recommendation.mode, "surf");
}
console.log("v5 closures: passed catalog/client filtering, closed eligibility, no scoring or windows in closed modes, and fixture run guardrails.");
