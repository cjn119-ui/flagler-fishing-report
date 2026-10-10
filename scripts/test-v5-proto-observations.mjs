import assert from "node:assert/strict";
import { fmtWind, hourlyOutlook, inPeriod, observationFor, observationRows, temperatureF } from "../site/v5/proto/proto-observations.js";

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
assert.equal(hourlyOutlook(99, false), "Outside window");
assert.equal(hourlyOutlook(null, true), "—");
console.log("test-v5-proto-observations: observation shapes, period selection, unit conversion input, and wind formatting passed");
