import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearNwsPointsCache, fetchNwsPoints } from "../site/v5/engine/adapters/nws-points.js";
import { fetchNwsHourly } from "../site/v5/engine/adapters/nws-hourly.js";
import { fetchNwsGridForecast } from "../site/v5/engine/adapters/nws-grid-forecast.js";
import { fetchNwsAlerts } from "../site/v5/engine/adapters/nws-alerts.js";
import { fetchNwsObservations } from "../site/v5/engine/adapters/nws-observations.js";
import { parseCoopsGmt, fetchCoopsPredictions } from "../site/v5/engine/adapters/coops-predictions.js";
import { fetchCoopsWaterTemperature } from "../site/v5/engine/adapters/coops-water-temperature.js";
import { fetchSecoora } from "../site/v5/engine/adapters/secoora.js";
import { fetchNdbcFallback } from "../site/v5/engine/adapters/ndbc-fallback.js";
import { fetchNwsWaveForecast, waveCoverage } from "../site/v5/engine/adapters/nws-wave.js";
import { fetchOpenMeteoMarineForecast, fetchOpenMeteoWeather } from "../site/v5/engine/adapters/open-meteo.js";
import { parseDurationMs } from "../site/v5/engine/adapters/shared.js";
import { clearSourceCache, fetchSources, sourceCachePolicy } from "../site/v5/engine/sources.js";
import { recordNormalizedInputs, serializeNormalizedInputs } from "../site/v5/engine/recorder.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "fixtures/v5/sources");
const fixture = name => JSON.parse(fs.readFileSync(path.join(fixtureDir, name + ".json"), "utf8"));
const now = Date.parse("2026-10-05T19:00:00Z");
const spot = { id: "flagler-pier", name: "Flagler Beach Pier", lat: 29.481, lon: -81.127,
  tide: "8721120", waterTemp: "8720218", buoy: "41117", cdip: "194", modes: ["pier", "surf"] };
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (error) { failed++; console.log("FAIL " + name + ": " + (error?.stack ?? error)); }
}
const response = json => ({ ok: true, status: 200, json: async () => json });
const failFetch = async () => { throw new Error("fixture transport failure"); };
function routedFetch(routes) {
  return async url => {
    const match = routes.find(([pattern]) => pattern.test(String(url)));
    if (!match) throw new Error("Unrecorded fixture request: " + url);
    const item = typeof match[1] === "function" ? match[1](String(url)) : match[1];
    if (item?.status === 503) return { ok: false, status: 503, json: async () => ({}) };
    return response(item);
  };
}
function openMeteoWeatherFixture() {
  const hourly = { time: [], temperature_2m: [], precipitation_probability: [], wind_speed_10m: [],
    wind_direction_10m: [], wind_gusts_10m: [] };
  for (let i = 0; i < 168; i++) {
    hourly.time.push(new Date(now + i * 3600000).toISOString().slice(0, 16));
    hourly.temperature_2m.push(75);
    hourly.precipitation_probability.push(20);
    hourly.wind_speed_10m.push(8);
    hourly.wind_direction_10m.push(90);
    hourly.wind_gusts_10m.push(12);
  }
  return { hourly };
}
function openMeteoMarineFixture() {
  const hourly = { time: [], wave_height: [], wave_period: [], wave_direction: [] };
  for (let i = 0; i < 168; i++) {
    hourly.time.push(new Date(now + i * 3600000).toISOString().slice(0, 16));
    hourly.wave_height.push(0.8);
    hourly.wave_period.push(7);
    hourly.wave_direction.push(45);
  }
  return { hourly };
}

await check("NWS points links, metadata, and seven-day cache", async () => {
  clearNwsPointsCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(fixture("nws-points-land")); };
  const first = await fetchNwsPoints(spot, { fetchImpl, now });
  const second = await fetchNwsPoints(spot, { fetchImpl, now: now + 60000 });
  assert.equal(first.ok, true); assert.equal(first.values.gridId, "JAX");
  assert.equal(first.values.forecastHourly.includes("/forecast/hourly"), true);
  assert.equal(second.cacheHit, true); assert.equal(calls, 1);
  const stale = await fetchNwsPoints(spot, { fetchImpl: failFetch, now: now + 8 * 86400000 });
  assert.equal(stale.ok, true); assert.equal(stale.stale, true); assert.equal(stale.fetchedAt, first.fetchedAt);
});

await check("NWS hourly and alerts parse independently", async () => {
  const points = await fetchNwsPoints(spot, { fetchImpl: async () => response(fixture("nws-points-land")), now });
  const hourly = await fetchNwsHourly(spot, { points, fetchImpl: async () => response(fixture("nws-hourly")), now });
  const alerts = await fetchNwsAlerts(spot, { fetchImpl: async () => response(fixture("nws-alerts")), now });
  assert.equal(hourly.ok, true); assert.ok(hourly.values.rows.length > 0); assert.match(hourly.issuedAt, /Z$/); assert.match(hourly.validFrom, /Z$/);
  assert.equal(alerts.ok, true); assert.equal(alerts.values.rows.length, 1);assert.equal(alerts.values.rows[0].event,"Small Craft Advisory");assert.equal(alerts.values.rows[0].severity,"Minor");
  const bad = await fetchNwsAlerts(spot, { fetchImpl: failFetch, now });
  assert.equal(bad.ok, false); assert.equal(hourly.ok, true);
});

await check("NWS land grid normalizes wind, temperature, PoP, thunder and gust intervals", async () => {
  const points = await fetchNwsPoints(spot, { fetchImpl: async () => response(fixture("nws-points-land")), now });
  const grid = await fetchNwsGridForecast(spot, { points, fetchImpl: async () => response(fixture("nws-grid-land")), now });
  assert.equal(grid.ok, true); assert.equal(grid.units.windSpeed, "mph"); assert.equal(grid.units.temperature, "°F");
  assert.ok(grid.values.windSpeed[0].value >= 0); assert.ok(grid.values.windGust[0].value >= 0);
  assert.ok(grid.values.temperature[0].value > 50); assert.ok(grid.values.probabilityOfPrecipitation[0].value >= 0);
  assert.ok(Array.isArray(grid.values.probabilityOfThunder));
});

await check("Open-Meteo adapters normalize UTC weather and marine forecast intervals", async () => {
  const fetchImpl = async url => response(String(url).includes("marine-api.")
    ? openMeteoMarineFixture() : openMeteoWeatherFixture());
  const weather = await fetchOpenMeteoWeather(spot, { fetchImpl, now });
  assert.equal(weather.hourly.provider, "open-meteo");
  assert.equal(weather.hourly.usedFallback, true);
  assert.equal(weather.hourly.issuedAt, null);
  assert.equal(weather.hourly.values.rows.length, 168);
  assert.equal(weather.hourly.values.rows[0].windSpeed, 8);
  assert.equal(weather.grid.values.windDirection[0].value, 90);
  assert.equal(weather.grid.values.probabilityOfPrecipitation[0].value, 20);

  const marine = await fetchOpenMeteoMarineForecast(spot, { fetchImpl, now });
  assert.equal(marine.provider, "open-meteo");
  assert.equal(marine.kind, "waveForecast");
  assert.equal(marine.values.rows[0].waveHeightM, 0.8);
  assert.equal(marine.values.rows[0].periodS, 7);
  assert.equal(waveCoverage(marine, marine.validFrom, marine.values.rows[0].validTo), true);
});

await check("stale NWS weather and marine forecasts fall back to fresh Open-Meteo data", async () => {
  clearSourceCache(); clearNwsPointsCache();
  const location = { ...spot, modes: ["surf"] };
  const staleAt = new Date(now - 8 * 3600000).toISOString();
  const pointsFixture = fixture("nws-points-land");
  const fetchImpl = async url => {
    const text = String(url);
    if (text.includes("/points/")) return response(pointsFixture);
    if (text.includes("/forecast/hourly")) {
      const value = fixture("nws-hourly");
      value.properties.updateTime = staleAt;
      return response(value);
    }
    if (text === "https://api.weather.gov/gridpoints/JAX/89,29") {
      const value = fixture("nws-grid-land");
      value.properties.updateTime = staleAt;
      return response(value);
    }
    if (text.includes("marine-api.open-meteo.com")) return response(openMeteoMarineFixture());
    if (text.includes("api.open-meteo.com")) return response(openMeteoWeatherFixture());
    throw new Error("fixture transport failure");
  };
  const inputs = await fetchSources({ locations: [location], fetchImpl, now });
  for (const kind of ["hourlyForecast", "gridForecast", "waveForecast"]) {
    const fallback = inputs.find(x => x.kind === kind);
    assert.equal(fallback?.provider, "open-meteo", `${kind} should use the fresh fallback`);
    assert.equal(fallback?.stale, false);
    assert.equal(fallback?.usedFallback, true);
  }
});

await check("NWS station readings preserve pressure samples", async () => {
  const points = await fetchNwsPoints(spot, { fetchImpl: async () => response(fixture("nws-points-land")), now });
  const fetchImpl = routedFetch([[/\/stations\/KFIN\/observations/, fixture("nws-observations")],
    [/\/gridpoints\/JAX\/89,29\/stations/, fixture("nws-stations")]]);
  const obs = await fetchNwsObservations(spot, { points, fetchImpl, now });
  assert.equal(obs.ok, true); assert.equal(obs.station, "KFIN");
  assert.ok(obs.values.rows[0].pressurePa > 0);
});

await check("CO-OPS GMT conversion and DST repeated hour remain distinct instants", async () => {
  const predictions = await fetchCoopsPredictions(spot, { fetchImpl: async () => response(fixture("coops-predictions")), now });
  assert.equal(predictions.ok, true); assert.match(predictions.values.rows[0].time, /Z$/);
  const a = parseCoopsGmt("2026-11-01 05:30"), b = parseCoopsGmt("2026-11-01 06:30");
  assert.notEqual(a, b);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  assert.match(fmt.format(new Date(a)), /1:30.*EDT/); assert.match(fmt.format(new Date(b)), /1:30.*EST/);
});

await check("CO-OPS water temperature parses readings and handles missing station", async () => {
  const water = await fetchCoopsWaterTemperature(spot, { fetchImpl: async () => response(fixture("coops-water-temperature")), now });
  assert.equal(water.ok, true); assert.equal(water.station, "8720218"); assert.ok(Number.isFinite(water.values.rows[0].temperatureC));
  const none = await fetchCoopsWaterTemperature({ ...spot, waterTemp: null }, { now });
  assert.equal(none.ok, false);
});

await check("SECOORA parses wave and temperature rows as separate inputs", async () => {
  const fetchImpl = routedFetch([[/sea_surface_wave_significant_height/, fixture("secoora-waves")],
    [/sea_water_temperature/, fixture("secoora-water")]]);
  const result = await fetchSecoora(spot, { fetchImpl, now });
  assert.equal(result.waves.ok, true); assert.ok(result.waves.values.waveHeightM > 0);
  assert.equal(result.water.ok, true); assert.ok(result.water.values.temperatureC > 0);
});

await check("NDBC marine snapshot parses and marks fallback", async () => {
  const obs = await fetchNdbcFallback(spot, { fetchImpl: async () => response(fixture("ndbc-marine")), url: "fixture://ndbc", now });
  assert.equal(obs.ok, true); assert.equal(obs.usedFallback, true); assert.ok(Number.isFinite(obs.values.waveHeightM));
});

await check("NWS wave intervals parse ISO durations and cover tomorrow's full window", async () => {
  const points = await fetchNwsPoints(spot, { fetchImpl: async () => response(fixture("nws-points-marine")), now, marine: true });
  const waves = await fetchNwsWaveForecast(spot, { points, fetchImpl: async () => response(fixture("nws-grid-wave")), now });
  assert.equal(waves.ok, true); assert.equal(waves.units, "wmoUnit:m");
  assert.ok(waves.values.rows.every(v => v.validFrom && v.validTo));
  assert.equal(parseDurationMs("P6DT13H"), (6 * 24 + 13) * 3600000);
  assert.equal(waveCoverage(waves, "2026-10-06T09:00:00Z", "2026-10-07T01:00:00Z"), true);
  assert.equal(waveCoverage({ ...waves, stale: true }, "2026-10-06T09:00:00Z", "2026-10-07T01:00:00Z"), false);
  const nulls = await fetchNwsWaveForecast(spot, { points, fetchImpl: async () => response({ properties: { updateTime: "2026-10-05T18:00:00Z",
    waveHeight: { uom: "wmoUnit:m", values: [{ validTime: "2026-10-06T09:00:00Z/PT2H", value: null }] } } }), now });
  assert.equal(nulls.values.rows[0].waveHeightM, null); assert.equal(waveCoverage(nulls, "2026-10-06T09:00:00Z", "2026-10-06T11:00:00Z"), false);
  const empty = await fetchNwsWaveForecast(spot, { points, fetchImpl: async () => response({ properties: { updateTime: "2026-10-05T18:00:00Z",
    waveHeight: { uom: "wmoUnit:m", values: [] } } }), now });
  assert.equal(empty.ok, true); assert.equal(waveCoverage(empty, "2026-10-06T09:00:00Z", "2026-10-06T11:00:00Z"), false);
});

await check("single source failure does not cancel unrelated inputs; SECOORA falls back to NDBC", async () => {
  clearSourceCache(); clearNwsPointsCache();
  const fetchImpl = routedFetch([
    [/\/points\/29\.481,-81\.127/, fixture("nws-points-land")],
    [/\/points\//, fixture("nws-points-marine")],
    [/\/forecast\/hourly/, fixture("nws-hourly")],
    [/\/gridpoints\/JAX\/89,29$/, fixture("nws-grid-land")],
    [/\/alerts\//, { status: 503 }],
    [/\/gridpoints\/JAX\/89,29\/stations/, fixture("nws-stations")],
    [/\/observations\?limit=/, fixture("nws-observations")],
    [/\/datagetter\?.*product=predictions/, fixture("coops-predictions")],
    [/\/datagetter\?.*water_temperature/, fixture("coops-water-temperature")],
    [/sea_surface_wave_significant_height/, { status: 503 }],
    [/sea_water_temperature/, { status: 503 }],
    [/marine\.json$/, fixture("ndbc-marine")],
    [/\/gridpoints\/JAX\/91,30$/, fixture("nws-grid-wave")],
  ]);
  const inputs = await fetchSources({ locations: [spot], fetchImpl, now });
  assert.ok(inputs.some(x => x.kind === "alerts" && !x.ok));
  assert.ok(inputs.some(x => x.kind === "hourlyForecast" && x.ok));
  assert.ok(inputs.some(x => x.kind === "waves" && x.ok && x.usedFallback));
  assert.ok(inputs.some(x => x.kind === "waterTemperature" && x.ok && x.usedFallback));
});

await check("all upstream failures return independent unavailable observations", async () => {
  clearSourceCache(); clearNwsPointsCache();
  const inputs = await fetchSources({ locations: [spot], fetchImpl: failFetch, now });
  assert.ok(inputs.length >= 8); assert.ok(inputs.every(x => x && typeof x.ok === "boolean"));
  assert.ok(inputs.filter(x => !x.ok).length >= 8);
});

await check("each individual adapter converts its own upstream failure to a result", async () => {
  clearNwsPointsCache();
  const points = { locationId: spot.id, station: "JAX/89,29", values: {
    forecastHourly: "https://api.weather.gov/gridpoints/JAX/89,29/forecast/hourly",
    forecastGridData: "https://api.weather.gov/gridpoints/JAX/89,29",
    observationStations: "https://api.weather.gov/gridpoints/JAX/89,29/stations" } };
  const results = await Promise.all([
    fetchNwsPoints(spot, { fetchImpl: failFetch, now, force: true }),
    fetchNwsHourly(spot, { points, fetchImpl: failFetch, now }),
    fetchNwsGridForecast(spot, { points, fetchImpl: failFetch, now }),
    fetchNwsAlerts(spot, { fetchImpl: failFetch, now }),
    fetchNwsObservations(spot, { points, fetchImpl: failFetch, now }),
    fetchCoopsPredictions(spot, { fetchImpl: failFetch, now }),
    fetchCoopsWaterTemperature(spot, { fetchImpl: failFetch, now }),
    fetchSecoora(spot, { fetchImpl: failFetch, now }).then(x => x.waves),
    fetchSecoora(spot, { fetchImpl: failFetch, now }).then(x => x.water),
    fetchNdbcFallback(spot, { fetchImpl: failFetch, url: "fixture://ndbc", now }),
    fetchNwsWaveForecast(spot, { points, fetchImpl: failFetch, now }),
  ]);
  assert.ok(results.every(x => x?.ok === false && x.safeErrorCode === "source_unavailable" && x.fetchedAt));
});

await check("normalized recorder ordering and SHA-256 are deterministic", async () => {
  const rows = [{ provider: "nws", kind: "z", values: { b: 2, a: 1 } }, { provider: "coops", kind: "a", values: null }];
  assert.equal(serializeNormalizedInputs(rows), serializeNormalizedInputs([...rows].reverse()));
  const a = await recordNormalizedInputs({ run: { id: "run-1", generatedAt: "2026-10-05T19:00:00Z" }, inputs: rows, pendingPredictions: ["A"] });
  const b = await recordNormalizedInputs({ run: { id: "run-1", generatedAt: "2026-10-05T19:00:00Z" }, inputs: [...rows].reverse(), pendingPredictions: ["A"] });
  assert.equal(a.inputsSha256, b.inputsSha256); assert.equal(a.inputsSha256.length, 64);
  assert.equal(a.status, "inputs-recorded-predictions-pending");
  const d = await recordNormalizedInputs({ inputs: [rows[0], rows[0]] });
  const archiveLines = d.inputsNdjson.trim().split("\n").map(JSON.parse);
  assert.equal(archiveLines[1].duplicateOf, archiveLines[0].inputHash);
});

assert.ok(sourceCachePolicy.ttlMs.points === 7 * 86400000);
console.log("RESULT " + passed + " passed, " + failed + " failed");
if (failed) process.exitCode = 1;
