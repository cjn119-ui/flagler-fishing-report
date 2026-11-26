import assert from "node:assert/strict";
import { activeAlerts, fmtWind, hourlyOutlook, inPeriod, observationFor, observationRows, temperatureF, tideChartXPositions, tideDirectionAt, waveHeightFeetLabel } from "../site/v5/proto/proto-observations.js";

const run = { inputs: { observations: [
  { kind: "hourlyForecast", locationId: "spot", ok: true, values: { rows: [
    { startTime: "2026-10-10T10:00:00Z", endTime: "2026-10-10T11:00:00Z", temperature: 17, temperatureUnit: "C", windSpeed: "18 mph", windDirection: "NE" },
  ] } },
  { kind: "hourlyForecast", locationId: "spot", ok: true, validFrom: "2026-10-10T11:00:00Z", validTo: "2026-10-10T12:00:00Z", values: { temperatureC: 20, windSpeed: 8, windDirection: "E" } },
  { kind: "waveForecast", locationId: "spot", ok: true, validFrom: "2026-10-10T11:00:00Z", values: { waveHeightM: 0.8 } },
] } };
const rows = observationRows(run, "hourlyForecast", "spot");
assert.equal(rows.length, 2);
assert.equal(rows[1].temperature, 20);
assert.equal(rows[1].temperatureUnit, "C");
assert.equal(temperatureF(rows[1]), 68, "Celsius observations are rendered in Fahrenheit");
assert.equal(temperatureF(rows[0]), 62.6);
assert.equal(fmtWind(rows[0]), "NE 18 mph", "existing mph units are not duplicated");
assert.equal(fmtWind(rows[1]), "E 8 mph");
assert.equal(inPeriod(rows[1], "2026-10-10T11:30:00Z"), true);
assert.equal(observationFor(rows, "2026-10-10T11:30:00Z"), rows[1]);
assert.equal(observationRows(run, "waveForecast", "spot")[0].waveHeightM, 0.8);
assert.equal(hourlyOutlook(49, true), "Poor");
assert.equal(hourlyOutlook(50, true), "Good");
assert.equal(hourlyOutlook(70, true), "Great");
assert.equal(hourlyOutlook(99, false), "Outside windows · fit 99");
assert.equal(hourlyOutlook(null, true), "—");
assert.equal(waveHeightFeetLabel({ waveHeightM: 0.51 }, "surf"), "1.7 ft");
assert.equal(waveHeightFeetLabel({ waveHeightM: 0.51 }, "pier"), "1.7 ft");
assert.equal(waveHeightFeetLabel({ waveHeightM: 0.51 }, "inshore"), null, "inshore tables omit ocean-wave height");
assert.equal(waveHeightFeetLabel({ waveHeightM: null }, "surf"), null);
{ // live buoy shapes: Celsius water temperature and single-reading waves (SECOORA)
  const live = { inputs: { observations: [
    { kind: "waterTemperature", locationId: "icw", ok: true, observedAt: "2026-10-14T17:28:20Z", values: { temperatureC: 27.4 } },
    { kind: "waves", locationId: "icw", ok: true, observedAt: "2026-10-14T17:00:00Z", values: { waveHeightM: 0.51, periodS: 7.7 } },
  ] } };
  const [water] = observationRows(live, "waterTemperature", "icw"), [wave] = observationRows(live, "waves", "icw");
  assert.equal(Math.round(water.temperatureF), 81);
  assert.equal(water.time, "2026-10-14T17:28:20Z");
  assert.equal(wave.waveHeightM, 0.51);
  assert.equal(observationFor([wave], "2026-10-14T18:00:00Z"), wave);
}
{ // tide direction from high/low predictions, any hour of the day
  const rows = [{ time: "2026-10-15T04:00:00Z", type: "L" }, { time: "2026-10-15T10:15:00Z", type: "H" }, { time: "2026-10-15T16:30:00Z", type: "L" }];
  assert.equal(tideDirectionAt(rows, "2026-10-15T07:00:00Z"), "incoming");
  assert.equal(tideDirectionAt(rows, "2026-10-15T13:00:00Z"), "outgoing");
  assert.equal(tideDirectionAt(rows, "2026-10-15T10:05:00Z"), "slack");
  assert.equal(tideDirectionAt(rows, "2026-10-15T20:00:00Z"), null);
  assert.equal(tideDirectionAt(rows, Date.parse("2026-10-15T07:00:00Z")), "incoming", "accepts epoch ms (the app passes ctx.now)");
  assert.deepEqual(tideChartXPositions([
    { time: "2026-10-15T04:00:00Z" },
    { time: "2026-10-15T06:00:00Z" },
    { time: "2026-10-15T12:00:00Z" },
  ]), [0, 25, 100], "chart event spacing follows actual elapsed time");
}
console.log("test-v5-proto-observations: observation shapes, period selection, unit conversion input, and wind formatting passed");

const alertRun = { inputs: { observations: [
  { kind: "alerts", locationId: "matanzas", ok: true, values: { rows: [
    { event: "Rip Current Statement", severity: "Moderate", ends: "2026-11-26T23:00:00Z", headline: "Rip Current Statement until 6 PM" },
    { event: "Coastal Flood Advisory", severity: "Minor", expires: "2026-11-27T05:00:00Z" },
    { event: "Small Craft Advisory", severity: "Minor", ends: "2026-11-26T12:00:00Z" },
    { event: "Gale Warning", severity: "Moderate", ends: null },
  ] } },
  { kind: "alerts", locationId: "other", ok: true, values: { rows: [{ event: "Dense Fog Advisory", ends: "2026-11-27T00:00:00Z" }] } },
  { kind: "alerts", locationId: "matanzas", ok: false, values: { rows: [{ event: "Tornado Warning" }] } },
] } };
assert.deepEqual(activeAlerts(alertRun, "matanzas", "2026-11-26T18:00:00Z").map((a) => a.event), ["Gale Warning", "Coastal Flood Advisory", "Rip Current Statement"], "warnings first, expired and failed feeds dropped, other spots excluded");
assert.equal(activeAlerts(alertRun, "matanzas", "2026-11-26T18:00:00Z")[2].endsAt, "2026-11-26T23:00:00.000Z");
assert.deepEqual(activeAlerts(alertRun, "matanzas", "2026-11-27T09:00:00Z").map((a) => a.event), ["Gale Warning"], "tomorrow's view drops alerts that end tonight");
assert.deepEqual(activeAlerts({}, "matanzas", Date.now()), []);
console.log("activeAlerts: ok");
