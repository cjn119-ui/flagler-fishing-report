// Regression: NOAA begin/end_date are GMT; at 01:05Z the old local-date end_date stopped ~3 h short
// of now+26h and the live tide endpoint failed with "only 3 events".
import assert from "node:assert/strict";
const FIXED = Date.parse("2026-10-11T01:05:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(FIXED); }
  static now() { return FIXED; }
};
let queried = null;
globalThis.fetch = async (url) => {
  queried = new URL(url).searchParams;
  const endDay = queried.get("end_date");
  // One hi/lo event every 6.2 h from 2026-10-10 00:00Z, kept only through the requested GMT end day.
  const t0 = RealDate.parse("2026-10-10T00:00:00Z");
  const predictions = [];
  for (let i = 0; i < 20; i++) {
    const t = new RealDate(t0 + i * 6.2 * 3600e3);
    if (t.toISOString().slice(0, 10).replaceAll("-", "") > endDay) break;
    predictions.push({ t: t.toISOString().slice(0, 16).replace("T", " "), v: String(i % 2 ? 4.1 : 0.3), type: i % 2 ? "H" : "L" });
  }
  return new Response(JSON.stringify({ predictions }), { status: 200 });
};
const worker = (await import("../src/worker.mjs")).default;
const res = await worker.fetch(new Request("https://local/api/live/tides"), { REPORTS: { get: async () => null, put: async () => {} } });
const body = await res.json();
assert.equal(res.status, 200, JSON.stringify(body));
assert.equal(queried.get("end_date"), "20261012", "end_date must be the GMT date of now+26h");
assert.equal(body.events.length, 4);
console.log("tide window ok");
