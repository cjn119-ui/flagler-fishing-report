import assert from "node:assert/strict";
import { catchesToCsv, loadCatches, saveCatches, summarizeCatches, validateCatch } from "../site/v5/proto/catch-log.js";

const spots = new Map([["flagler-pier", { modes: ["pier", "surf"] }]]);
const spotById = (id) => spots.get(id);
const base = { species: "whiting", spot: "flagler-pier", mode: "pier", occurredAt: "2026-10-10T12:00", count: 2, disposition: "released", lengthIn: "14", notes: "" };
assert.deepEqual(validateCatch(base, { now: Date.parse("2026-10-10T13:00"), spotById }), {});
assert.ok(validateCatch({ ...base, occurredAt: "2026-10-11T12:00", count: 100, lengthIn: "81" }, { now: Date.parse("2026-10-10T13:00"), spotById }).occurredAt);
assert.ok(validateCatch({ ...base, species: "other", otherSpecies: " " }, { now: Date.parse("2026-10-10T13:00"), spotById }).species);
assert.ok(validateCatch({ ...base, mode: "surfcasting" }, { now: Date.parse("2026-10-10T13:00"), spotById }).mode);

const data = { schemaVersion: 1, id: "1", occurredAt: "2026-10-10T12:00:00.000Z", species: "whiting", speciesName: "Whiting", spot: "flagler-pier", spotName: "Flagler Pier", mode: "pier", count: 2, disposition: "released", context: { runGeneratedAt: "2026-10-10T11:00:00Z", verdict: "GO", fit: 74 } };
const backing = new Map();
const storage = { getItem: (key) => backing.get(key) ?? null, setItem: (key, value) => backing.set(key, value) };
assert.equal(saveCatches([data], storage), true);
assert.deepEqual(loadCatches(storage), [data]);
assert.deepEqual(summarizeCatches([data], { now: Date.parse("2026-10-10T12:30:00Z"), spotName: () => "Flagler Pier", speciesName: () => "Whiting" }), { catchesThisMonth: 2, topSpecies: "whiting", bestSpot: "flagler-pier", topSpeciesName: "Whiting", bestSpotName: "Flagler Pier" });
assert.equal(summarizeCatches([{ ...data, occurredAt: "2026-11-01T02:00:00.000Z" }], { now: Date.parse("2026-11-01T03:30:00.000Z") }).catchesThisMonth, 2, "month totals follow America/New_York at UTC month boundaries");
assert.match(catchesToCsv([data]), /"Whiting","Flagler Pier","pier","2","released"/);
console.log("test-v5-catch-log: 9 assertions passed");
