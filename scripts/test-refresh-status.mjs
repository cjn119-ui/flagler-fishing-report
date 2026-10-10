import assert from "node:assert/strict";
import { buildStatus } from "./refresh-status.mjs";

const now = new Date("2026-10-10T12:00:00Z");
const state = { "current-report": { generated_at: "2026-10-10T10:00:00Z" }, "next-day-report": { generated_at: "2026-10-10T08:00:00Z" } };
const s = buildStatus({ status: "stale-last-good", state, now, log: "  ✗ MARINE: observed_at is stale: 92 min old\nTIDES ok\n", env: { RUN_ID: "1" } });
assert.equal(s.status, "stale-last-good");
assert.equal(s.oldest_report_age_min, 240);
assert.deepEqual(s.reasons, ["MARINE: observed_at is stale: 92 min old"]);
assert.equal(buildStatus({ status: "fresh", state: null, now }).oldest_report_age_min, null);
console.log("refresh-status ok");
