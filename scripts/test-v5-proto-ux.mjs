import assert from "node:assert/strict";
import {
  bestUpcomingCandidate, excludeSpot, formatConfidenceParts, formatCopyMessage,
  formatHeadline, nearestSlotIndex, nextWindowLabel, rankSpeciesRows,
  slotIndexAt, sourceSummaries,
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
console.log("RESULT V5 prototype UX regression checks passed");
