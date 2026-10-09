import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  backupTitle, bestUpcomingCandidate, confidenceDisplay, excludeSpot, factorLine,
  formatConfidenceParts, formatCopyMessage, formatHeadline, nearestSlotIndex, defaultSlotIndex,
  nextWindowLabel, pickComparison, presentChildren, rankSpeciesRows, scrubWindows,
  slotHeld, slotInWindow, slotIndexAt, sourceSummaries, windowPhase,
} from "../site/v5/engine/copy.js";

const now = Date.parse("2026-10-09T07:51:00-04:00");
const scopedRun = { days: [{ windows: [
  { locationId: "other", mode: "surf", start: "2026-10-09T16:00:00Z" },
  { locationId: "same", mode: "surf", start: "2026-10-09T11:00:00Z" },
  { locationId: "same", mode: "pier", start: "2026-10-09T14:00:00Z" },
  { locationId: "same", mode: "surf", start: "2026-10-09T15:00:00Z" },
] }] };
assert.equal(nextWindowLabel(scopedRun, { locationId: "same", mode: "surf" }, now), "Next window 11 AM");
assert.equal(nextWindowLabel({ days: [{ windows: [{ locationId: "same", mode: "surf", start: "2026-10-10T11:00:00Z" }] }] }, { locationId: "same", mode: "surf" }, now), "Next window Tomorrow 7 AM");
assert.equal(nextWindowLabel({ days: [] }, { locationId: "same", mode: "surf" }, now), null);

const slots = [{ at: "2026-10-09T08:00:00Z" }, { at: "2026-10-09T08:30:00Z" }, { at: "2026-10-09T09:00:00Z" }];
assert.equal(slotIndexAt(slots, "2026-10-09T07:00:00Z"), -1);
assert.equal(slotIndexAt(slots, "2026-10-09T09:45:00Z"), -1);
assert.equal(slotIndexAt(slots, "2026-10-09T08:35:00Z"), 1);
assert.equal(nearestSlotIndex(slots, "2026-10-09T09:45:00Z"), 2);

assert.equal(formatHeadline({ recommendation: { horizon: "tomorrow", headline: { text: "Better fishing today" } } }), "Better fishing tomorrow");
assert.equal(formatHeadline({ recommendation: { horizon: "today", headline: { text: "Better fishing today" } } }), "Better fishing today");
assert.equal(formatCopyMessage({ kind: "reason", code: "notOnSpotList" }), "Not usually caught at the spots we cover.");
assert.doesNotMatch(formatCopyMessage({ kind: "reason", code: "someOtherReasonCode" }), /[a-z][A-Z]/);

const sources = [
  { kind: "gridForecast", provider: "nws", status: "current", available: true, fetchedAt: "2026-10-09T09:00:00Z" },
  { kind: "gridForecast", provider: "nws", status: "stale", stale: true, available: true, fetchedAt: "2026-10-09T09:01:00Z" },
  { kind: "points", provider: "nws", status: "current", available: true, fetchedAt: "2026-10-09T09:00:00Z" },
];
const grouped = sourceSummaries(sources, false, () => "9 AM");
assert.equal(grouped.length, 2);
assert.deepEqual(grouped.map(x => x.label), ["Forecast grid", "NWS location lookup"]);
assert.equal(grouped[0].status, "stale");
assert.equal(sourceSummaries(sources.slice(0, 1), true, () => "5:26 AM")[0].state, "As of 5:26 AM");

const rows = [{ loc: { id: "selected" } }, { loc: { id: "other" } }];
assert.deepEqual(excludeSpot(rows, "selected"), [rows[1]]);
const ranked = rankSpeciesRows([
  { sp: { id: "rare" }, best: { eligibility: "rare" }, suit: 99 },
  { sp: { id: "realistic" }, best: { eligibility: "realistic" }, suit: 55 },
  { sp: { id: "rare-low" }, best: { eligibility: "rare" }, suit: 45 },
]);
assert.deepEqual(ranked.map(x => x.sp.id), ["realistic", "rare", "rare-low"]);

const best = bestUpcomingCandidate([
  { id: "ended", suitability: 99, window: { end: "2026-10-09T10:00:00Z" } },
  { id: "future", suitability: 70, window: { end: "2026-10-09T18:00:00Z" } },
], now);
assert.equal(best.id, "future");
const confidence = formatConfidenceParts({ recommendation: { confidenceLevel: "Moderate", confidence: null } });
assert.equal(confidence.level, "Moderate confidence");
assert.equal(confidence.score, null);

assert.deepEqual(presentChildren("a", null, false, ["b", null]), ["a", "b"]);
const protoSource = readFileSync("site/v5/proto/proto.js", "utf8");
assert.doesNotMatch(protoSource, /readout\.replaceChildren\(/);
assert.match(protoSource, /fill\(readout,/);
const phaseWin = { start: "2026-10-05T10:00:00Z", end: "2026-10-05T11:00:00Z" };
assert.equal(windowPhase(phaseWin, "2026-10-05T09:00:00Z"), "upcoming");
assert.equal(windowPhase(phaseWin, "2026-10-05T10:30:00Z"), "open");
assert.equal(windowPhase(phaseWin, "2026-10-05T11:00:00Z"), "ended");
assert.equal(windowPhase(null, "2026-10-05T10:30:00Z"), "none");
const skipFixture = JSON.parse(readFileSync("site/v5/proto/sample-skip.json", "utf8"));
const skipRec = skipFixture.recommendation;
assert.equal(scrubWindows(skipRec, skipFixture.days, { skip: true }).some(w => w.start === skipRec.window.start), false);
assert.equal(scrubWindows(skipRec, skipFixture.days, { skip: false }).some(w => w.start === skipRec.window.start), true);
assert.equal(slotInWindow("2026-10-05T22:00:00Z", [{ start: "2026-10-05T22:55:00Z", end: "2026-10-05T23:30:00Z" }]), false);
assert.equal(slotHeld("2026-10-05T18:00:00Z", skipRec.window.gates), true);
assert.equal(factorLine("Thunderstorms", "Thunderstorms 2–6 PM"), "Thunderstorms 2–6 PM");
assert.equal(factorLine("Wind", "Breezy"), "Wind: Breezy");
assert.deepEqual(confidenceDisplay({ level: "Moderate confidence", score: 77 }, { stale: true }), { word: "Moderate", suffix: "last known", scoreNote: "Score 77 of 100 when issued" });
assert.deepEqual(confidenceDisplay({ level: "Moderate confidence", score: 77 }, { stale: false }), { word: "Moderate", suffix: null, scoreNote: "Score 77 of 100" });
assert.equal(pickComparison(skipRec), "better");
assert.equal(backupTitle(skipRec.backup, skipRec, "Flagler Beach ICW (Veterans Park)", "7:45 AM–12:45 PM").startsWith("Later here"), false);
{ // default scrubber selection: current hour on Today, even after the best window ended
  const hrs = [5,6,7,8,9,10,11].map((hh) => ({ at: `2026-10-09T${String(hh+4).padStart(2,"0")}:00:00Z` })); // 5–11 AM EDT
  const win = (at) => at === hrs[1].at || at === hrs[2].at; // 6–8 AM window
  assert.equal(defaultSlotIndex(hrs, "2026-10-09T13:30:00Z", true, win), 4);  // 9:30 AM, window over -> 9 AM, not 6 AM
  assert.equal(defaultSlotIndex(hrs, "2026-10-09T10:15:00Z", true, win), 1);  // 6:15 AM, inside window -> now
  assert.equal(defaultSlotIndex(hrs, "2026-10-09T07:00:00Z", true, win), 1);  // 3 AM, before series -> next window
  assert.equal(defaultSlotIndex(hrs, "2026-10-09T20:00:00Z", true, win), 6);  // 4 PM, after series -> last slot
  assert.equal(defaultSlotIndex(hrs, "2026-10-09T13:30:00Z", false, win), 1); // Tomorrow tab -> first window
}
console.log("RESULT V5 prototype UX regression checks passed");
