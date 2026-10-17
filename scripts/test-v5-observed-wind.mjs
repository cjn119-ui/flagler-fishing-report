import assert from "node:assert/strict";
import { observedWindAt } from "../site/v5/engine/observed-wind.js";
import { fetchRiverkeeperWind } from "../site/v5/engine/adapters/riverkeeper-wind.js";

const now = Date.parse("2026-10-17T20:10:00Z"), slot = "2026-10-17T20:00:00.000Z";
const nws = (rows, extra = {}) => ({ ok: true, station: "KSGJ", values: { rows }, ...extra });
const river = (rows) => ({ ok: true, station: "matanzas-riverkeeper", values: { rows } });
const near = { time: "2026-10-17T20:05:00Z", windSpeedKmh: 31.5, windGustKmh: 50, windDirectionDeg: 360 };
const riverRow = { time: "2026-10-17T20:07:00Z", windSpeedMs: 3, windGustMs: 4, windDirectionDeg: 20 };

let r = observedWindAt(nws([near]), river([riverRow]), slot, now);
assert.equal(r.source, "nws:KSGJ"); assert.ok(Math.abs(r.windMph - 19.57) < 0.05); assert.ok(Math.abs(r.windGustMph - 31.07) < 0.05); assert.equal(r.windDirectionDeg, 360);

r = observedWindAt(nws([{ ...near, time: "2026-10-17T17:50:00Z" }]), river([riverRow]), slot, now);
assert.equal(r.source, "matanzas-riverkeeper"); assert.ok(Math.abs(r.windMph - 6.71) < 0.05);

assert.equal(observedWindAt(nws([{ ...near, time: "2026-10-17T17:50:00Z" }]), river([{ ...riverRow, time: "2026-10-17T17:50:00Z" }]), slot, now), null);
assert.equal(observedWindAt(nws([near]), null, "2026-10-17T23:00:00.000Z", now), null, "future slots stay on the forecast");
assert.equal(observedWindAt(nws([near]), null, "2026-10-17T15:00:00.000Z", now), null, "past slots stay on the forecast");
assert.equal(observedWindAt({ ok: false, values: {} }, null, slot, now), null);
assert.equal(observedWindAt(nws([{ ...near, windSpeedKmh: null }]), null, slot, now), null);
assert.equal(observedWindAt(nws([near]), null, Date.parse(slot) - 3 * 3600000, now), null);

// UI asks for "now" itself: an observation 56 minutes old still counts; the next slot (an hour out) does not.
r = observedWindAt(nws([{ ...near, time: "2026-10-17T19:14:00Z" }]), river([riverRow]), new Date(now).toISOString(), now);
assert.equal(r.source, "nws:KSGJ");
assert.equal(observedWindAt(nws([near]), null, "2026-10-17T21:00:00.000Z", now), null, "next slot stays on the forecast");

const table = { table: { columnNames: ["time", "wind_speed_cm_time__mean_over_pt5m", "wind_speed_cm_time__maximum_over_pt5m", "wind_from_direction_cm_time__mean_over_pt5m", "wind_speed_cm_time__mean_over_pt5m_qc_agg"],
  rows: [["2026-10-17T20:02:54Z", 2.1, 2.6, 23, 1], ["2026-10-17T20:07:55Z", 4.8, 5.4, 19, 3], ["2026-10-17T20:12:56Z", 3.4, 3.8, 28, 1], ["2026-10-17T20:17:57Z", null, null, null, 9]] } };
const ok = await fetchRiverkeeperWind({ id: "salt-run" }, { fetchImpl: async () => ({ ok: true, json: async () => table }), now: Date.parse("2026-10-17T20:20:00Z") });
assert.equal(ok.ok, true); assert.equal(ok.kind, "windObservations"); assert.equal(ok.locationId, "salt-run");
assert.deepEqual(ok.values.rows.map((x) => x.time), ["2026-10-17T20:12:56Z", "2026-10-17T20:02:54Z"], "drops suspect/missing rows, newest first");
assert.equal(ok.stale, false);
const bad = await fetchRiverkeeperWind({ id: "x" }, { fetchImpl: async () => ({ ok: false, status: 503 }) });
assert.equal(bad.ok, false);
console.log("test-v5-observed-wind: precedence, freshness, slot window, unit conversion, and Riverkeeper parsing passed");
