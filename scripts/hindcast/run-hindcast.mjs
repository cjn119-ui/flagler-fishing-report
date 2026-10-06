#!/usr/bin/env node
// Deterministic, offline A5 hindcast. Forecast-slot observations are deliberately
// labelled perfect-observation sensitivity inputs; they are not forecast skill.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ACTIVE_SPOTS } from "../../site/v5/spots.js";
import { SPECIES } from "../../site/v5/species.js";
import { loadFirstCoastHistory } from "../../site/v5/engine/history.js";
import { buildPredictionRun } from "../../site/v5/engine/run.js";
import { generateSlots, selectDriver, verdictFor } from "../../site/v5/engine/model.js";
import { MODEL_PARAMS, validateParams } from "../../site/v5/engine/params.js";
import { validateNormalizedObservation } from "../../site/v5/engine/contracts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CACHE_DIR = path.join(ROOT, ".cache/hindcast");
export const OUTPUT_DIR = path.join(ROOT, ".cache/hindcast-out");
export const REPORT_PATH = path.join(ROOT, "docs/v5-hindcast-report.md");
export const REPORT_LABEL = "perfect-observation sensitivity hindcast, not a forecast-accuracy test";
export const DATE_START = "2025-10-01";
export const DATE_END = "2026-09-30";
export const BUILD_HOURS = Object.freeze([6, 19]);
export const GO_THRESHOLDS = Object.freeze([55, 60, 65, 70, 75, 80, 85]);
export const TIDE_SCALES = Object.freeze([0.375, 0.5, 0.625]);
// Off-list species cannot be eligible for selection at any active spot. Keep
// every decision-relevant species while avoiding repeated ineligible scoring.
export const ACTIVE_TARGET_SPECIES = Object.freeze(SPECIES.filter(species => ACTIVE_SPOTS.some(spot =>
  spot.active !== false && spot.targets?.includes(species.id) && spot.modes.some(mode => species.modes?.includes(mode)))));
const TZ = "America/New_York";
const SLOT_MS = MODEL_PARAMS.windows.slotMinutes * 60000;
const MAX_INTERPOLATION_GAP_MS = 3 * 3600000;
const CATEGORY_NEAREST_MAX_MS = 90 * 60000;
const SHA = text => createHash("sha256").update(text).digest("hex");
const has = value => typeof value === "number" && Number.isFinite(value);
const iso = ms => new Date(ms).toISOString();
const stable = value => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);

export function pct(numerator, denominator) {
  return Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
}

function localOffsetAt(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000;
}

export function localInstant(day, hour, minute = 0) {
  const [year, month, date] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  let guess = wall - localOffsetAt(wall);
  for (let i = 0; i < 3; i++) guess = wall - localOffsetAt(guess);
  return guess;
}

function monthKey(day) { return day.slice(0, 7); }
function datesInWindow() {
  const out = [];
  for (let ms = Date.parse(`${DATE_START}T00:00:00Z`); ms <= Date.parse(`${DATE_END}T00:00:00Z`); ms += 86400000) out.push(iso(ms).slice(0, 10));
  return out;
}
const DATE_KEYS = datesInWindow();
export const DEFAULT_DATES = DATE_KEYS;
const candidateParamsCache = new Map();

export function candidateParams({ tideScale, goThreshold = GO_THRESHOLDS[0] }) {
  const params = {
    ...MODEL_PARAMS,
    factors: { ...MODEL_PARAMS.factors, tide: { ...MODEL_PARAMS.factors.tide, rateNormalizationScale: tideScale, rateNormalizationScaleProvisional: false } },
    thresholds: { ...MODEL_PARAMS.thresholds, goSuitabilityMin: goThreshold, goSuitabilityMinProvisional: false },
  };
  validateParams(params);
  return params;
}

function actualTime(row) {
  const parsed = Date.parse(row.reportTime ?? row.t ?? "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function validSamples(rows, field, timeFn = actualTime, transform = x => x) {
  return rows.map(row => ({ t: timeFn(row), v: transform(row[field]) })).filter(x => Number.isFinite(x.t) && has(x.v)).sort((a, b) => a.t - b.t);
}

function bracketValue(samples, at, maxGap = MAX_INTERPOLATION_GAP_MS) {
  let lo = null, hi = null;
  for (const sample of samples) {
    if (sample.t === at) return sample.v;
    if (sample.t < at) lo = sample;
    else { hi = sample; break; }
  }
  if (!lo || !hi || hi.t - lo.t > maxGap) return null;
  const part = (at - lo.t) / (hi.t - lo.t);
  return lo.v + (hi.v - lo.v) * part;
}

function bracketDirection(samples, at) {
  let lo = null, hi = null;
  for (const sample of samples) {
    if (sample.t === at) return sample.v;
    if (sample.t < at) lo = sample;
    else { hi = sample; break; }
  }
  if (!lo || !hi || hi.t - lo.t > MAX_INTERPOLATION_GAP_MS) return null;
  const part = (at - lo.t) / (hi.t - lo.t);
  const delta = ((hi.v - lo.v + 540) % 360) - 180;
  return (lo.v + delta * part + 360) % 360;
}

function nearestRow(rows, at, maxDistance = CATEGORY_NEAREST_MAX_MS, timeFn = actualTime) {
  let best = null, gap = Infinity;
  for (const row of rows) {
    const t = timeFn(row), distance = Math.abs(t - at);
    if (Number.isFinite(t) && distance < gap) { best = row; gap = distance; }
  }
  return gap <= maxDistance ? best : null;
}

function cardinal(degrees) {
  if (!has(degrees)) return null;
  const names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return names[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}

function observation({ locationId, kind, provider = "hindcast", station = null, units = {}, now, observedAt = null, issuedAt = null, values, ok = true, safeErrorCode = null, inputBasis, assumption = undefined }) {
  return {
    locationId, fetchedAt: iso(now), ok, stale: false, usedFallback: false, safeErrorCode, station,
    observedAt: observedAt == null ? null : iso(observedAt), issuedAt: issuedAt == null ? null : iso(issuedAt), validFrom: null, validTo: null,
    units, provider, kind, values, inputBasis, ...(assumption ? { assumption } : {}),
  };
}

function requiredForecastSlots(now, params) {
  return [...new Set([
    ...generateSlots({ now, horizon: "today", params }),
    ...generateSlots({ now, horizon: "tomorrow", params }),
  ])].sort();
}

function inTimeRange(value, min, max) { const t = Date.parse(value); return Number.isFinite(t) && t >= min && t <= max; }

// The cached, checksum-pinned archive rows are time-sorted. Binary bounds keep
// each build's interpolation work proportional to its two-day slot window.
function lowerBound(rows, timeFn, instant) {
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (timeFn(rows[mid]) < instant) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function rowsInTimeRange(rows, timeFn, from, to) {
  return rows.slice(lowerBound(rows, timeFn, from), lowerBound(rows, timeFn, to + 1));
}

function latestRowAtOrBefore(rows, timeFn, predicate, instant) {
  for (let i = lowerBound(rows, timeFn, instant + 1) - 1; i >= 0; i--) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

/**
 * Convert the exact cached rows into engine-shaped, immutable inputs.
 * `allowPerfectObservationSlots` is true only for the labelled sensitivity run.
 * In strict as-of mode, no post-instant observed KFIN/CDIP row enters the build.
 */
export function buildNormalizedObservations({ now, spot, datasets, params, allowPerfectObservationSlots = true }) {
  const nowMs = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("now must be a valid instant");
  const slots = allowPerfectObservationSlots ? requiredForecastSlots(nowMs, params) : [];
  const slotMs = params.windows.slotMinutes * 60000;
  const firstMs = slots.length ? Date.parse(slots[0]) : nowMs;
  const lastMs = slots.length ? Date.parse(slots.at(-1)) : nowMs;
  const kfinArchive = datasets.kfin.rows;
  const cdipArchive = datasets.cdip.rows;
  const kfinSampleTime = row => actualTime(row);
  const cdipSampleTime = row => Date.parse(row.t);
  const forecastFrom = slots.length ? firstMs - MAX_INTERPOLATION_GAP_MS : nowMs;
  const forecastTo = slots.length ? lastMs + slotMs + MAX_INTERPOLATION_GAP_MS : nowMs;
  const kfin = rowsInTimeRange(kfinArchive, kfinSampleTime, forecastFrom, forecastTo);
  const cdip = rowsInTimeRange(cdipArchive, cdipSampleTime, forecastFrom, forecastTo);
  const wind = validSamples(kfin, "windKt", kfinSampleTime, value => value * 1.150779448);
  const gust = validSamples(kfin, "gustKt", kfinSampleTime, value => value * 1.150779448);
  const direction = validSamples(kfin, "directionDeg", kfinSampleTime);
  const pressure = validSamples(kfin, "altimeterInHg", kfinSampleTime, value => value * 33.8638866667);
  const waves = validSamples(cdip, "waveHeightM", cdipSampleTime);
  const interpRows = [];
  const gridFields = { windSpeed: [], windGust: [], windDirection: [], probabilityOfPrecipitation: [], probabilityOfThunder: [], weatherCode: [] };
  for (const slot of slots) {
    const start = Date.parse(slot), end = start + slotMs, at = start + slotMs / 2;
    const windMph = bracketValue(wind, at);
    const gustMph = bracketValue(gust, at);
    const directionDeg = bracketDirection(direction, at);
    const sample = nearestRow(kfin, at);
    const rainPct = sample && has(sample.precipitationIn) ? sample.precipitationIn > 0 ? 100 : 0 : null;
    const code = sample?.weatherCodes ?? null;
    const thunder = typeof code === "string" ? /(?:^|\s)(?:VCTS|TS|\+TS|-TS|TSRA|\+TSRA|-TSRA)(?:$|\s)/i.test(code) : null;
    const values = { windMph, gustMph, directionDeg, rainPct, thunder, weatherCode: code };
    interpRows.push({ at: slot, startTime: iso(start), endTime: iso(end), windMph, gustMph, directionDeg, rainPct, thunder, weatherCode: code });
    const validFrom = iso(start), validTo = iso(end);
    gridFields.windSpeed.push({ validFrom, validTo, value: windMph });
    gridFields.windGust.push({ validFrom, validTo, value: gustMph });
    gridFields.windDirection.push({ validFrom, validTo, value: directionDeg });
    gridFields.probabilityOfPrecipitation.push({ validFrom, validTo, value: rainPct });
    gridFields.probabilityOfThunder.push({ validFrom, validTo, value: thunder === null ? null : thunder ? 100 : 0 });
    gridFields.weatherCode.push({ validFrom, validTo, value: code });
  }

  const kfinFrom = allowPerfectObservationSlots ? nowMs - 9 * 3600000 : -Infinity;
  const kfinTo = allowPerfectObservationSlots ? lastMs : nowMs;
  const pressureRows = rowsInTimeRange(kfinArchive, kfinSampleTime, kfinFrom, kfinTo).filter(row => has(row.altimeterInHg))
    .map(row => ({ at: iso(actualTime(row)), pressureHpa: row.altimeterInHg * 33.8638866667 }))
    .filter(row => Number.isFinite(Date.parse(row.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latestWater = latestRowAtOrBefore(cdipArchive, cdipSampleTime, row => has(row.waterTempC), nowMs);
  const latestWave = latestRowAtOrBefore(cdipArchive, cdipSampleTime, row => has(row.waveHeightM), nowMs);
  const tideRows = datasets.tidesByStation[spot.tide]?.rows ?? [];
  // Harmonic predictions are known from the station/day table; retain bracketing
  // H/L rows around the modeled slot period and label that distinct basis.
  const tideFrom = (slots.length ? firstMs : nowMs) - 12 * 3600000;
  const tideTo = (slots.length ? lastMs : nowMs) + 12 * 3600000;
  const tides = rowsInTimeRange(tideRows, row => Date.parse(row.t), tideFrom, tideTo)
    .map(row => ({ time: row.t, heightFt: row.heightFt, type: row.type }));
  const waveForecastRows = slots.map(slot => {
    const start = Date.parse(slot), end = start + slotMs, center = start + slotMs / 2;
    const value = bracketValue(waves, center);
    return has(value) ? { validFrom: iso(start), validTo: iso(end), waveHeightM: value } : null;
  }).filter(Boolean);
  const recentWave = latestWave && nowMs - Date.parse(latestWave.t) <= 3 * 3600000 ? latestWave : null;

  return [
    observation({ locationId: spot.id, kind: "hourlyForecast", station: "KFIN", now: nowMs, issuedAt: nowMs, provider: "hindcast-perfect-observation", inputBasis: "hindcast-perfect-observation", units: { windSpeed: "mph", windDirection: "degree_from_north", precipitationProbability: "percent proxy", weatherCode: "ASOS present-weather code" }, values: { rows: interpRows.map(row => ({ startTime: row.startTime, endTime: row.endTime, windSpeed: has(row.windMph) ? `${row.windMph.toFixed(3)} mph` : null, windDirection: cardinal(row.directionDeg), probabilityOfPrecipitation: row.rainPct, shortForecast: row.weatherCode, thunder: row.thunder })) } }),
    observation({ locationId: spot.id, kind: "gridForecast", station: "KFIN", now: nowMs, issuedAt: nowMs, provider: "hindcast-perfect-observation", inputBasis: "hindcast-perfect-observation", units: { windSpeed: "mph", windGust: "mph", windDirection: "degree_from_north", probabilityOfPrecipitation: "percent proxy", probabilityOfThunder: "binary observed-code proxy" }, values: gridFields }),
    observation({ locationId: spot.id, kind: "pressureObservations", station: "KFIN", now: nowMs, observedAt: pressureRows.length ? Date.parse(pressureRows.at(-1).at) : null, provider: "hindcast-perfect-observation", inputBasis: allowPerfectObservationSlots ? "hindcast-perfect-observation" : "as-of-observations-only", units: { pressureHpa: "hPa derived from ASOS altimeter inHg" }, values: { rows: pressureRows }, ok: pressureRows.length > 0, safeErrorCode: pressureRows.length ? null : "hindcast-pressure-unavailable" }),
    observation({ locationId: spot.id, kind: "tidePredictions", station: spot.tide, now: nowMs, observedAt: null, issuedAt: nowMs, provider: "co-ops-harmonic-prediction", inputBasis: "CO-OPS date-calculated harmonic H/L predictions", units: { heightFt: "foot relative to MLLW", time: "UTC" }, values: { rows: tides }, ok: tides.length > 0, safeErrorCode: tides.length ? null : "hindcast-tide-unavailable" }),
    observation({ locationId: spot.id, kind: "waves", station: "CDIP 194", now: nowMs, observedAt: recentWave ? Date.parse(recentWave.t) : null, provider: "secoora", inputBasis: "CDIP 194 latest observed wave at or before build instant", units: { waveHeightM: "m" }, values: recentWave ? { waveHeightM: recentWave.waveHeightM, periodS: recentWave.peakPeriodS, directionDeg: recentWave.waveDirectionDeg } : {}, ok: !!recentWave, safeErrorCode: recentWave ? null : "hindcast-wave-observation-stale-or-missing" }),
    observation({ locationId: spot.id, kind: "waterTemperature", station: "CDIP 194", now: nowMs, observedAt: latestWater ? Date.parse(latestWater.t) : null, provider: "secoora", inputBasis: "CDIP 194 latest observed water temperature at or before build instant", units: { temperatureC: "C" }, values: latestWater ? { rows: [{ time: latestWater.t, temperatureC: latestWater.waterTempC }] } : {}, ok: !!latestWater, safeErrorCode: latestWater ? null : "hindcast-water-temperature-missing" }),
    observation({ locationId: spot.id, kind: "waveForecast", station: "CDIP 194", now: nowMs, issuedAt: nowMs, provider: "hindcast-perfect-observation", inputBasis: "hindcast-perfect-observation", units: { waveHeightM: "m" }, values: { rows: waveForecastRows } }),
    observation({ locationId: spot.id, kind: "alerts", station: null, now: nowMs, issuedAt: nowMs, provider: "hindcast-scenario", inputBasis: "historical alerts unavailable", assumption: "unverified/checked-none", units: {}, values: { rows: [], assumption: "unverified/checked-none" } }),
  ];
}

export async function loadCachedInputs(cacheDir = CACHE_DIR) {
  const manifestPath = path.join(ROOT, "scripts/hindcast/MANIFEST.json");
  let manifestText;
  try { manifestText = await readFile(manifestPath, "utf8"); }
  catch { throw new Error(`Hindcast source manifest is missing at ${manifestPath}.`); }
  const manifest = JSON.parse(manifestText);
  const sourceHashes = {};
  const products = {};
  for (const source of manifest.sources.filter(row => row.output)) {
    const file = path.join(cacheDir, source.output);
    let text;
    try { text = await readFile(file, "utf8"); }
    catch { throw new Error(`Hindcast cache missing ${file}. Acquire it once with node scripts/hindcast/fetch-hindcast-data.mjs.`); }
    const actual = SHA(text);
    if (source.sha256 && actual !== source.sha256) throw new Error(`Hindcast checksum mismatch for ${source.output}: manifest ${source.sha256}, cached ${actual}`);
    sourceHashes[source.output] = actual;
    products[source.output] = JSON.parse(text);
  }
  const tidesByStation = {};
  for (const station of new Set(ACTIVE_SPOTS.map(spot => spot.tide))) {
    const fileName = `tides-${station}.json`;
    if (!products[fileName]) throw new Error(`Hindcast source manifest has no ${fileName} for an active tide station.`);
    tidesByStation[station] = products[fileName];
  }
  const history = await loadFirstCoastHistory({ readJson: async () => JSON.parse(await readFile(path.join(ROOT, "site/v5/data/first-coast-history.json"), "utf8")) });
  if (!products["kfin-hourly.json"] || !products["cdip-194.json"]) throw new Error("The source manifest must include KFIN and CDIP 194 archive products.");
  return { manifest, manifestSha256: SHA(manifestText), sourceHashes, kfin: products["kfin-hourly.json"], cdip: products["cdip-194.json"], tidesByStation, history };
}

function detailSlots(run, candidate) {
  const details = run.details?.[candidate.detailsRef];
  return details?.rows?.find(row => row.speciesId === candidate.speciesId)?.slots ?? [];
}

function waveIntervalCovered(observation, at) {
  const ms = Date.parse(at);
  return observation?.ok === true && (observation.values?.rows ?? []).some(row => has(row.waveHeightM) && Date.parse(row.validFrom) <= ms && Date.parse(row.validTo) > ms);
}

function weatherCodeCovered(observation, at) {
  const ms = Date.parse(at);
  return (observation?.values?.weatherCode ?? []).some(row => typeof row.value === "string" && row.value.trim() !== "" && Date.parse(row.validFrom) <= ms && Date.parse(row.validTo) > ms);
}

function sourceCompleteness(slots, mode, waveObservation, gridObservation) {
  if (!slots.length) return false;
  return slots.every(row => {
    const c = row.conditions ?? {};
    const core = [c.windMph, c.windGustMph, c.windDirectionDeg, c.rainPct, c.tideHeightFt, c.tideRateFtPerHr, c.waterTempF, c.pressureChange6hHpa].every(has)
      && typeof c.thunder === "boolean" && weatherCodeCovered(gridObservation, row.at);
    return core && (mode === "inshore" || (has(c.waveHeightM) && waveIntervalCovered(waveObservation, row.at)));
  });
}

function enrichCandidates(run, horizon, details, observations, spots, params) {
  const obsByLocation = new Map();
  for (const item of observations) {
    let map = obsByLocation.get(item.locationId);
    if (!map) obsByLocation.set(item.locationId, map = new Map());
    map.set(item.kind, item);
  }
  const activeOrder = new Map(spots.map((spot, index) => [spot.id, index]));
  return run.candidates.map(candidate => {
    const rows = detailSlots({ details }, candidate);
    const obs = obsByLocation.get(candidate.locationId) ?? new Map();
    const forecast = [obs.get("hourlyForecast"), obs.get("gridForecast")].find(item => item?.ok && !item.stale);
    const forecastAgeHours = forecast?.issuedAt ? Math.max(0, (Date.parse(run.generatedAt) - Date.parse(forecast.issuedAt)) / 3600000) : null;
    const alerts = obs.get("alerts");
    const alertsChecked = !!alerts?.ok && !alerts.stale;
    const safetyInputsReady = rows.length > 0 && rows.every(row => has(row.conditions?.windMph) && has(row.conditions?.windGustMph) && typeof row.conditions?.thunder === "boolean");
    // The engine's live hourly adapter defaults an absent thunder code to false.
    // A5 keeps the archived source absence unknown and refuses GO eligibility here.
    const observedThunderReady = rows.length > 0 && rows.every(row => weatherCodeCovered(obs.get("gridForecast"), row.at));
    const wavesReady = candidate.mode === "inshore" || (horizon === "today"
      ? !!obs.get("waves")?.ok && !obs.get("waves")?.stale && Number.isFinite(Date.parse(obs.get("waves")?.observedAt)) && Date.parse(run.generatedAt) - Date.parse(obs.get("waves")?.observedAt) <= 3 * 3600000
      : rows.length > 0 && rows.every(row => waveIntervalCovered(obs.get("waveForecast"), row.at)));
    const enough = !candidate.caps?.some(cap => cap.code === "notEnoughCurrentData");
    const conditionsReady = has(candidate.suitability) && enough && safetyInputsReady && observedThunderReady && forecastAgeHours !== null
      && forecastAgeHours <= params.freshness.forecastMaxAgeHours && alertsChecked && wavesReady;
    const spot = spots.find(item => item.id === candidate.locationId);
    return {
      id: candidate.id, speciesId: candidate.speciesId, locationId: candidate.locationId, mode: candidate.mode,
      start: candidate.window?.start, end: candidate.window?.end, suitability: candidate.suitability, confidence: candidate.confidence,
      eligibility: candidate.eligibility, gates: candidate.window?.gates ?? [], caps: candidate.caps ?? [],
      conditionsReady, sourceComplete: sourceCompleteness(rows, candidate.mode, obs.get("waveForecast"), obs.get("gridForecast")),
      onTargetList: !!spot?.targets?.includes(candidate.speciesId), catalogOrder: activeOrder.get(candidate.locationId) ?? 0,
      speciesLead: candidate.speciesId,
    };
  });
}

function candidateAtThreshold(candidate, params) {
  const verdict = verdictFor({ suitability: candidate.suitability, confidence: candidate.confidence, eligibility: candidate.eligibility,
    conditionsReady: candidate.conditionsReady, gates: candidate.gates, params });
  return { ...candidate, verdict };
}

function pick(candidates, params) {
  return selectDriver(candidates.map(candidate => candidateAtThreshold(candidate, params)), { preferences: {}, params }).selected ?? null;
}

function compactSelection(candidate) {
  if (!candidate) return null;
  return {
    id: candidate.id, speciesId: candidate.speciesId, locationId: candidate.locationId, mode: candidate.mode,
    verdict: candidate.verdict, suitability: candidate.suitability, confidence: candidate.confidence,
    sourceComplete: candidate.sourceComplete, safetyGated: candidate.gates.length > 0, gateCodes: candidate.gates.map(gate => gate.code),
  };
}

function scopeCoverage(candidates, spots) {
  const out = {};
  for (const spot of spots) for (const mode of spot.modes) {
    const key = `${spot.id}:${mode}`;
    out[key] = {
      hasPrediction: candidates.some(candidate => candidate.locationId === spot.id && candidate.mode === mode),
      complete: candidates.some(candidate => candidate.locationId === spot.id && candidate.mode === mode && candidate.sourceComplete),
      candidateCount: candidates.filter(candidate => candidate.locationId === spot.id && candidate.mode === mode).length,
    };
  }
  return out;
}

function summarizeHorizon(run, horizon, details, observations, spots, paramsByThreshold) {
  const candidates = enrichCandidates(run, horizon, details, observations, spots, paramsByThreshold.get(GO_THRESHOLDS[0]));
  const byThreshold = {};
  for (const threshold of GO_THRESHOLDS) {
    const params = paramsByThreshold.get(threshold);
    const rated = candidates.map(candidate => candidateAtThreshold(candidate, params));
    const byLocation = {};
    for (const spot of spots) for (const mode of spot.modes) {
      const key = `${spot.id}:${mode}`;
      byLocation[key] = compactSelection(pick(rated.filter(candidate => candidate.locationId === spot.id && candidate.mode === mode), params));
    }
    byThreshold[threshold] = { best: compactSelection(pick(rated, params)), byLocation };
  }
  return { targetDate: run.targetDate, id: run.id, scopeCoverage: scopeCoverage(candidates, spots), byThreshold };
}

function blankCounts() { return { GO: 0, MAYBE: 0, SKIP: 0, allGO: 0, allMAYBE: 0, allSKIP: 0, sourceComplete: 0, safetyGated: 0, allSafetyGated: 0, ungated: 0, observed: 0, selected: 0 }; }
function addSelection(counts, selection) {
  counts.observed++;
  if (!selection) return;
  counts.selected++;
  counts[`all${selection.verdict}`]++;
  if (selection.safetyGated) counts.allSafetyGated++;
  if (selection.sourceComplete) {
    counts.sourceComplete++;
    if (selection.safetyGated) counts.safetyGated++;
    else { counts.ungated++; counts[selection.verdict]++; }
  }
}
function freezeCounts(counts) {
  return {
    ...counts,
    goShare: pct(counts.GO, counts.ungated), maybeShare: pct(counts.MAYBE, counts.ungated), skipShare: pct(counts.SKIP, counts.ungated),
    allGoShare: pct(counts.allGO, counts.selected), allMaybeShare: pct(counts.allMAYBE, counts.selected), allSkipShare: pct(counts.allSKIP, counts.selected),
  };
}

export function evaluateFrequencyGates({ coverageRows, overall, monthly, spotModes, minimumCoverage = 0.80 }) {
  const coverageFailures = coverageRows.filter(row => !row.totalDays || pct(row.completeDays, row.totalDays) === null || pct(row.completeDays, row.totalDays) < minimumCoverage);
  const overallShare = pct(overall.GO, overall.ungated);
  const overallPass = overallShare !== null && overallShare >= 0.15 && overallShare <= 0.40;
  const monthFailures = monthly.filter(row => pct(row.GO, row.ungated) === null || pct(row.GO, row.ungated) > 0.70);
  const spotModeFailures = spotModes.filter(row => pct(row.GO, row.ungated) === null || pct(row.GO, row.ungated) < 0.03);
  return {
    sourceCoveragePass: coverageFailures.length === 0,
    sourceCoverageFailures: coverageFailures,
    overallFrequencyPass: overallPass,
    overallShare,
    monthFrequencyPass: monthFailures.length === 0,
    monthFailures,
    spotModeFrequencyPass: spotModeFailures.length === 0,
    spotModeFailures,
    pass: coverageFailures.length === 0 && overallPass && monthFailures.length === 0 && spotModeFailures.length === 0,
  };
}

function summarizeScenarioRows(rows, spots, dates = DATE_KEYS) {
  const thresholds = {};
  for (const threshold of GO_THRESHOLDS) {
    const bestCounts = blankCounts();
    const monthKeys = [...new Set(dates.map(monthKey))];
    const modeCounts = new Map(["surf", "pier", "inshore"].map(mode => [mode, blankCounts()]));
    const spotModeCounts = new Map(spots.flatMap(spot => spot.modes.map(mode => [`${spot.id}:${mode}`, blankCounts()])));
    const leadSpecies = {};
    const monthlyCoverage = new Map();
    for (const day of dates) for (const spot of spots) for (const mode of spot.modes) {
      const key = `${monthKey(day)}|${spot.id}:${mode}`;
      if (!monthlyCoverage.has(key)) monthlyCoverage.set(key, { month: monthKey(day), locationId: spot.id, mode, completeDays: 0, totalDays: 0, candidateDays: 0, safetyGatedDays: 0, sourceCompleteSafetyGatedDays: 0, ungatedCompleteRecommendationDays: 0 });
      monthlyCoverage.get(key).totalDays++;
    }

    for (const row of rows) {
      const scope = row.today.scopeCoverage;
      for (const [key, covered] of Object.entries(scope)) {
        const monthly = monthlyCoverage.get(`${monthKey(row.day)}|${key}`);
        if (covered.hasPrediction) monthly.candidateDays++;
        if (covered.complete) monthly.completeDays++;
        const selected70 = row.today.byThreshold[70].byLocation[key];
        if (selected70?.safetyGated) monthly.safetyGatedDays++;
        if (selected70?.sourceComplete && selected70.safetyGated) monthly.sourceCompleteSafetyGatedDays++;
        if (selected70?.sourceComplete && !selected70.safetyGated) monthly.ungatedCompleteRecommendationDays++;
      }
      const selection = row.today.byThreshold[threshold].best;
      addSelection(bestCounts, selection);
      if (selection?.speciesId) leadSpecies[selection.speciesId] = (leadSpecies[selection.speciesId] ?? 0) + 1;
      if (selection) addSelection(modeCounts.get(selection.mode), selection);
      const scopes = row.today.byThreshold[threshold].byLocation;
      for (const [key, selected] of Object.entries(scopes)) addSelection(spotModeCounts.get(key), selected);
    }

    const monthlyStats = monthKeys.map(month => {
      const perMonthRows = rows.filter(row => monthKey(row.day) === month);
      const counts = blankCounts();
      for (const row of perMonthRows) addSelection(counts, row.today.byThreshold[threshold].best);
      return { month, days: perMonthRows.length, ...freezeCounts(counts) };
    });
    const coverageRows = [...monthlyCoverage.values()].map(row => ({ ...row, coverage: pct(row.completeDays, row.totalDays) }));
    const scopeRows = [...spotModeCounts.entries()].map(([key, counts]) => {
      const [locationId, mode] = key.split(":");
      return { locationId, mode, ...freezeCounts(counts) };
    });
    const modeStats = [...modeCounts.entries()].map(([mode, counts]) => ({ mode, ...freezeCounts(counts) }));
    const monthlyGateRows = monthlyStats.map(row => ({ month: row.month, GO: row.GO, ungated: row.ungated, sourceComplete: row.sourceComplete }));
    const gate = evaluateFrequencyGates({ coverageRows, overall: bestCounts, monthly: monthlyGateRows, spotModes: scopeRows });
    const leadDistribution = Object.entries(leadSpecies).map(([speciesId, count]) => ({ speciesId, count, shareOfBestSelections: pct(count, rows.length) })).sort((a, b) => b.count - a.count || a.speciesId.localeCompare(b.speciesId));
    thresholds[threshold] = {
      overall: freezeCounts(bestCounts), byMode: modeStats, monthly: monthlyStats, spotModes: scopeRows,
      sourceCoverage: coverageRows, leadDistribution, gates: gate,
    };
  }
  return thresholds;
}

export function secondarySummaries(allRows) {
  const result = {};
  for (const [label, hour, horizon] of [["morningTomorrow", 6, "tomorrow"], ["eveningToday", 19, "today"], ["eveningTomorrow", 19, "tomorrow"]]) {
    const rows = allRows.filter(row => row.hour === hour && row[horizon]);
    const byThreshold = {};
    for (const threshold of GO_THRESHOLDS) {
      const counts = blankCounts();
      for (const row of rows) addSelection(counts, row[horizon].byThreshold[threshold].best);
      byThreshold[threshold] = freezeCounts(counts);
    }
    result[label] = { rows: rows.length, byThreshold };
  }
  return result;
}

const observationCache = new WeakMap();
const profileBuildTimes = [];
function observationsAtInstant(day, hour, cached, params) {
  let byInstant = observationCache.get(cached);
  if (!byInstant) observationCache.set(cached, byInstant = new Map());
  const key = `${day}|${hour}`;
  if (!byInstant.has(key)) {
    const now = localInstant(day, hour);
    byInstant.set(key, ACTIVE_SPOTS.flatMap(spot => buildNormalizedObservations({ now, spot, datasets: cached, params, allowPerfectObservationSlots: true })));
  }
  return byInstant.get(key);
}

async function buildOne({ day, hour, tideScale, paramsByThreshold, cached }) {
  const now = localInstant(day, hour);
  const generationParams = paramsByThreshold.get(GO_THRESHOLDS[0]);
  const observations = observationsAtInstant(day, hour, cached, generationParams);
  const started = performance.now();
  const built = await buildPredictionRun({ now, locations: ACTIVE_SPOTS, species: ACTIVE_TARGET_SPECIES, history: cached.history, observations,
    params: generationParams, codeRevision: "a5-hindcast-worker-c82f4fa", catalogHash: "active-catalog-at-c82f4fa" });
  profileBuildTimes.push(performance.now() - started);
  const today = summarizeHorizon(built.today, "today", built.details, observations, ACTIVE_SPOTS, paramsByThreshold);
  const tomorrow = summarizeHorizon(built.tomorrow, "tomorrow", built.details, observations, ACTIVE_SPOTS, paramsByThreshold);
  return { day, hour, now: iso(now), tideScale, today, tomorrow };
}

export async function buildDayBundle(day, cached, { primaryOnly = false } = {}) {
  const byScale = {};
  for (const tideScale of TIDE_SCALES) {
    const paramsByThreshold = new Map(GO_THRESHOLDS.map(threshold => [threshold, candidateParams({ tideScale, goThreshold: threshold })]));
    byScale[tideScale] = [];
    const hours = primaryOnly ? [6] : tideScale === 0.5 ? BUILD_HOURS : [6];
    for (const hour of hours) {
      byScale[tideScale].push(await buildOne({ day, hour, tideScale, paramsByThreshold, cached }));
    }
  }
  return { day, byScale, builds: Object.values(byScale).reduce((sum, rows) => sum + rows.length, 0) };
}

function percentageOrDash(value) { return value === null ? "—" : `${(value * 100).toFixed(1)}%`; }
function sharesLine(counts) { return `GO ${percentageOrDash(counts.goShare)} · MAYBE ${percentageOrDash(counts.maybeShare)} · SKIP ${percentageOrDash(counts.skipShare)} (n=${counts.ungated}, source-complete=${counts.sourceComplete}, safety-gated=${counts.safetyGated})`; }
function esc(value) { return String(value).replaceAll("|", "\\|"); }

export function renderReport(summary) {
  const base = summary.scenarios.find(scenario => scenario.tideScale === 0.5);
  const base70 = base.thresholds[70];
  const failingCoverage = base70.sourceCoverage.filter(row => row.coverage === null || row.coverage < 0.8);
  const lines = [
    `# V5 A5 ${summary.dateKeys.length}-date hindcast and GO-frequency gate`, "", `**Every result is a ${REPORT_LABEL}.**`, "",
    `Window: ${summary.window.start} through ${summary.window.endInclusive} (local build dates). ${summary.primaryOnly ? "All scenarios use primary 06:00 builds only." : "The 0.50 ft/hr baseline uses 06:00 and 19:00 America/New_York builds; ±25% tide sensitivity uses the primary 06:00 build."} ${summary.buildCount} real model builds were run. The primary independent daily statistic is the 06:00 today Best-anywhere recommendation (${summary.dateKeys.length} dates); tomorrow and 19:00 baseline outputs are separate diagnostics.`, "",
    "## Headline (proposal baseline: tide scale 0.50 ft/hr, GO threshold 70)", "",
    "| Measure | Result | Gate |", "|---|---:|---|",
    `| 06:00 Best-anywhere verdict shares among source-complete, ungated days | ${sharesLine(base70.overall)} | GO target 15–40% |`,
    `| Diagnostic verdict mix across all selected 06:00 Best-anywhere recommendations | GO ${percentageOrDash(base70.overall.allGoShare)} · MAYBE ${percentageOrDash(base70.overall.allMaybeShare)} · SKIP ${percentageOrDash(base70.overall.allSkipShare)} (n=${base70.overall.selected}; includes incomplete/gated days) | diagnostic only |`,
    `| Source-complete date coverage, weakest spot×mode×month | ${percentageOrDash(summary.weakestCoverage.coverage)} (${summary.weakestCoverage.locationId} · ${summary.weakestCoverage.mode} · ${summary.weakestCoverage.month}) | ≥80% every month |`,
    `| Highest monthly Best-anywhere GO share | ${summary.highestMonth.share === null ? "—" : `${percentageOrDash(summary.highestMonth.share)} (${summary.highestMonth.month})`} | ≤70% each month |`,
    `| Weakest active location×mode GO share | ${summary.weakestSpotMode.share === null ? "—" : `${percentageOrDash(summary.weakestSpotMode.share)} (${summary.weakestSpotMode.locationId} · ${summary.weakestSpotMode.mode})`} | ≥3% each |`,
    "",
    "## Gate status at threshold 70", "",
    "| Gate | Result | Details |", "|---|---|---|",
    `| Monthly source coverage | **${base70.gates.sourceCoveragePass ? "PASS" : "FAIL"}** | ${base70.gates.sourceCoverageFailures.length} spot×mode×month rows below 80% |`,
    `| Best-anywhere GO share | **${base70.gates.overallFrequencyPass ? "PASS" : "FAIL"}** | ${percentageOrDash(base70.gates.overallShare)} of source-complete ungated daily recommendations |`,
    `| No month over 70% GO | **${base70.gates.monthFrequencyPass ? "PASS" : "FAIL"}** | ${base70.gates.monthFailures.length} zero-denominator or >70% months |`,
    `| Every active spot×mode at least 3% GO | **${base70.gates.spotModeFrequencyPass ? "PASS" : "FAIL"}** | ${base70.gates.spotModeFailures.length} zero-denominator or <3% spot×mode scopes |`,
    `| Full launch-frequency gate | **${base70.gates.pass ? "PASS" : "FAIL — owner review / exception required"}** | A5 does not accept any provisional parameter |`,
    "",
    "## Monthly source-complete denominators", "",
    "A source-complete spot×mode×date is one where the real model emitted at least one candidate window whose every 30-minute slot had wind, gust, direction, rain proxy, observed thunder state, pressure trend, CO-OPS tide height/rate, and CDIP water temperature; ocean modes also require a CDIP wave observation/interpolation for every slot. This strict source-coverage measure is independent of safety gates; a complete-but-safety-gated date is reported separately. The fixed MRIP artifact and computed astro are not counted as live source channels.", "",
    `All 12 months × active spot×mode denominators follow; FAIL rows are the coverage-gate exceptions (${failingCoverage.length} rows). Safety-gated counts are for each spot×mode's selected recommendation at threshold 70; source-complete safety gates are shown separately.`, "",
    ];
  lines.push("| Month | Spot | Mode | Candidate days | Source-complete / dates | Incomplete dates | Safety-gated selected recs | Source-complete safety-gated | Ungated complete recs | Coverage | Gate |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const row of base70.sourceCoverage) lines.push(`| ${row.month} | ${row.locationId} | ${row.mode} | ${row.candidateDays} | ${row.completeDays}/${row.totalDays} | ${row.totalDays - row.completeDays} | ${row.safetyGatedDays} | ${row.sourceCompleteSafetyGatedDays} | ${row.ungatedCompleteRecommendationDays} | ${percentageOrDash(row.coverage)} | ${row.coverage !== null && row.coverage >= 0.8 ? "PASS" : "FAIL"} |`);
  lines.push("");
  lines.push("## GO threshold sweep at tide scale 0.50 ft/hr", "", "Threshold values are review candidates only. Best-anywhere shares use source-complete, ungated 06:00 today recommendations; each spot×mode row uses its own selected daily recommendation on source-complete, ungated dates.", "", "| goSuitabilityMin candidate | Best GO share | Best denominator | Gate result | Surf GO share | Pier GO share | Inshore GO share |", "|---:|---:|---:|---|---:|---:|---:|");
  for (const threshold of GO_THRESHOLDS) {
    const result = base.thresholds[threshold], mode = new Map(result.byMode.map(row => [row.mode, row]));
    lines.push(`| ${threshold} | ${percentageOrDash(result.overall.goShare)} | ${result.overall.GO}/${result.overall.ungated} | ${result.gates.pass ? "PASS" : "FAIL"} | ${percentageOrDash(mode.get("surf")?.goShare ?? null)} | ${percentageOrDash(mode.get("pier")?.goShare ?? null)} | ${percentageOrDash(mode.get("inshore")?.goShare ?? null)} |`);
  }
  lines.push("", "### Per spot×mode GO share by threshold", "", "Each cell is GO / source-complete ungated days. An em dash means no valid denominator; zero denominators fail the gate.", "", `| Spot | Mode | ${GO_THRESHOLDS.join(" | ")} |`, `|---|---|${GO_THRESHOLDS.map(() => "---:").join("|")}|`);
  const scopeKeys = base.thresholds[70].spotModes.map(row => `${row.locationId}:${row.mode}`);
  for (const key of scopeKeys) {
    const [locationId, mode] = key.split(":");
    const vals = GO_THRESHOLDS.map(threshold => {
      const row = base.thresholds[threshold].spotModes.find(item => `${item.locationId}:${item.mode}` === key);
      return row ? `${row.GO}/${row.ungated} (${percentageOrDash(row.goShare)})` : "—";
    });
    lines.push(`| ${locationId} | ${mode} | ${vals.join(" | ")} |`);
  }
  lines.push("", "## Mode recommendation verdict mix at threshold 70", "", "Mode rows include dates where Best-anywhere selected that mode; all-run mix includes incomplete or safety-gated recommendations. The source-complete, ungated gate mix remains in the threshold table.", "", "| Selected mode | GO / n | GO share | MAYBE share | SKIP share | Complete ungated GO / n |", "|---|---:|---:|---:|---:|---:|");
  for (const row of base70.byMode) lines.push(`| ${row.mode} | ${row.allGO}/${row.selected} | ${percentageOrDash(row.allGoShare)} | ${percentageOrDash(row.allMaybeShare)} | ${percentageOrDash(row.allSkipShare)} | ${row.GO}/${row.ungated} |`);
  const inshore = base70.byMode.find(row => row.mode === "inshore");
  lines.push("", "### Inshore gate detail", "", `Across selected inshore daily recommendations: GO ${inshore?.allGO ?? 0}/${inshore?.selected ?? 0} (${percentageOrDash(inshore?.allGoShare ?? null)}), MAYBE ${inshore?.allMAYBE ?? 0}, SKIP ${inshore?.allSKIP ?? 0}; source-complete ungated GO ${inshore?.GO ?? 0}/${inshore?.ungated ?? 0} (${percentageOrDash(inshore?.goShare ?? null)}). Each active inshore spot is listed in the location×mode sweep; monthly inshore denominators appear in the source table above.`, "");
  lines.push("", "## Month-by-month Best-anywhere frequency at threshold 70", "", "| Month | GO / denominator | GO share | MAYBE share | SKIP share | Safety-gated selected recs |", "|---|---:|---:|---:|---:|---:|");
  for (const row of base70.monthly) lines.push(`| ${row.month} | ${row.GO}/${row.ungated} | ${percentageOrDash(row.goShare)} | ${percentageOrDash(row.maybeShare)} | ${percentageOrDash(row.skipShare)} | ${row.allSafetyGated} |`);
  lines.push("", "## Best-anywhere leads", "", "06:00 today selected driver species across all dates (including incomplete/gated days):", "", `| Species | Leads / ${summary.dateKeys.length} | Share |`, "|---|---:|---:|");
  for (const row of base70.leadDistribution) lines.push(`| ${row.speciesId} | ${row.count}/${summary.dateKeys.length} | ${percentageOrDash(row.shareOfBestSelections)} |`);
  lines.push("", "## Tide-scale sensitivity", "", "The code kept `params.js` unchanged and ran full engine builds with copied parameter objects at the documented 0.50 ft/hr proposal and ±25% (0.375, 0.625). Each scale is crossed with every threshold candidate.", "", "| Tide scale ft/hr | GO threshold | Best GO share | Denominator | Inshore GO share | Inshore denominator | Mean Best suitability | Gate result |", "|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const scenario of summary.scenarios) for (const threshold of GO_THRESHOLDS) {
    const result = scenario.thresholds[threshold], inshore = result.byMode.find(row => row.mode === "inshore");
    lines.push(`| ${scenario.tideScale.toFixed(3)} | ${threshold} | ${percentageOrDash(result.overall.goShare)} | ${result.overall.GO}/${result.overall.ungated} | ${percentageOrDash(inshore?.goShare ?? null)} | ${inshore?.GO ?? 0}/${inshore?.ungated ?? 0} | ${scenario.meanBestSuitability.toFixed(1)} | ${result.gates.pass ? "PASS" : "FAIL"} |`);
  }
  lines.push("", "## Morning, evening, and tomorrow", "", "| Output | GO / MAYBE / SKIP shares on source-complete ungated recommendations (threshold 70, tide 0.50) |", "|---|---|", `| 06:00 tomorrow | ${sharesLine(base.secondary.morningTomorrow.byThreshold[70])} |`, `| 19:00 today/evening | ${sharesLine(base.secondary.eveningToday.byThreshold[70])} |`, `| 19:00 tomorrow | ${sharesLine(base.secondary.eveningTomorrow.byThreshold[70])} |`, "", "## Alerts and confidence", "", "Historical NWS alerts were unavailable. Every run used the ADR scenario assumption `unverified/checked-none`, with an empty alert list and `alertsChecked=true`. This avoids the engine's unchecked-alert confidence penalty (20 points) and removes historical warning safety gates; it can therefore increase GO eligibility and confidence relative to unknown real alert history. Those alerts are not recovered facts. No counterfactual alert history is inferred.", "", "## Fixed parameter iteration record", "", "| Iteration | Input | Measured use | Outcome / decision status |", "|---|---|---|---|", "| 0 | Committed `MODEL_PARAMS`: GO threshold null, realistic floor 0.05 marked provisional, tide normalization null with proposal 0.50 | Read only; no baseline GO threshold or tide factor is active in the committed parameters | Kept untouched; not accepted by A5 |", "| 1 | Tide scale 0.500 ft/hr; GO threshold candidates 55, 60, 65, 70, 75, 80, 85 | Full-year daily recommendation sweep | See threshold table; candidate status only |", "| 2 | Tide scales 0.375 and 0.625 ft/hr; same seven thresholds | Full-year sensitivity to −25% / +25% around 0.500 | See tide table; candidate status only |", `| 3 | Source completeness required as defined above; alerts fixed to ${summary.alertAssumption} | All 12 months × active spot×mode scopes evaluated | No score/floor/tide edits were made to force a pass |`, "", "## Proposals and unresolved gate", "");
  const passing = summary.scenarios.flatMap(scenario => GO_THRESHOLDS.filter(threshold => scenario.thresholds[threshold].gates.pass).map(threshold => ({ tideScale: scenario.tideScale, threshold })));
  if (passing.length) lines.push(`Measured passing candidates: ${passing.map(item => `${item.threshold} at ${item.tideScale.toFixed(3)} ft/hr`).join(", ")}. These remain proposals requiring Chris's acceptance; this report did not promote them to params.js.`, "");
  else lines.push("No tested threshold/tide-scale pair passes every source-coverage and GO-frequency gate. No `goSuitabilityMin` proposal can be recommended from this archive alone. Keep the GO threshold pending; keep the 0.05 realistic floor provisional and keep tide normalization at null in `params.js`. The source-coverage shortfall needs an owner decision on a documented data source/coverage exception or additional archived measurements before frequency acceptance.", "");
  lines.push("## Method and caveats", "", `- ${REPORT_LABEL}; observed target-slot data are a perfect-information stand-in and not a forecast-accuracy test.`,
    "- Runs use real `buildPredictionRun` and the current V5 model for every active spot×mode, with deterministic local 06:00 and 19:00 build instants. No random components or network fetches are used.",
    `- The engine receives ${ACTIVE_TARGET_SPECIES.length} species targetable at at least one active spot×mode; catalog species outside every active target list are off-list everywhere and cannot win a recommendation.`,
    "- KFIN ASOS uses actual `reportTime` for interpolation and point availability. Wind and pressure are converted from knots/inHg; rain occurrence is mapped to a labelled 0/100 proxy. Gust and weather-code gaps remain missing; the harness does not infer gusts or thunder from absent fields. Interpolation requires bracketing valid values no more than three hours apart; weather code/rain use the nearest report only within 90 minutes.",
    "- CDIP 194 is a single offshore station, used at all spot coordinates without spatial correction. Wave values use bracketing observations within three hours as perfect target-slot stand-ins. Water temperature uses the latest CDIP observation at or before build time, never a later temperature.",
    "- CO-OPS rows are date-calculated harmonic high/low predictions in GMT/MLLW, not measurements or archived prediction issuance. Tide scale is tested only as a proposed model parameter.",
    "- ASOS gust field coverage is sparse; because model GO requires gust and a boolean thunder observation in every slot, missingness can prevent source-complete windows and GO regardless of the score threshold. Weather-code nulls remain unknown.",
    "- MRIP inputs are the frozen regional survey artifact. Suitability is not probability or catch accuracy. This hindcast does not establish station-level representativeness, real forecast skill, operational safety, or recovered historical alerts.",
    `- Source/cache hashes, build count, and exact summaries are in the gitignored .cache/hindcast-out/hindcast-results.json. Source manifest SHA-256: ${summary.manifestSha256}.`, "");
  return `${lines.join("\n")}\n`;
}

function chunkDenominators(records, dates) {
  const rows = new Map();
  for (const day of dates) for (const spot of ACTIVE_SPOTS) for (const mode of spot.modes) {
    const key = `${monthKey(day)}|${spot.id}|${mode}`;
    rows.set(key, { month: monthKey(day), locationId: spot.id, mode, totalDays: (rows.get(key)?.totalDays ?? 0) + 1, completeDays: rows.get(key)?.completeDays ?? 0, candidateDays: rows.get(key)?.candidateDays ?? 0 });
  }
  for (const record of records.filter(row => row.hour === 6 && row.tideScale === 0.5)) {
    for (const [scope, value] of Object.entries(record.today.scopeCoverage)) {
      const [locationId, mode] = scope.split(":");
      const row = rows.get(`${monthKey(record.day)}|${locationId}|${mode}`);
      if (value.complete) row.completeDays++;
      if (value.hasPrediction) row.candidateDays++;
    }
  }
  return [...rows.values()];
}

export function summarizeRecords(records, dates, { primaryOnly = false, manifestSha256, sourceHashes, workerCount = 1 } = {}) {
  const byScale = new Map(TIDE_SCALES.map(scale => [scale, []]));
  for (const row of records) byScale.get(row.tideScale).push(row);
  const buildCount = records.length;
  const scenarios = [];
  for (const tideScale of TIDE_SCALES) {
    const rows = byScale.get(tideScale).sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour);
    const primaryRows = rows.filter(row => row.hour === 6).map(row => ({ day: row.day, today: row.today }));
    const thresholds = summarizeScenarioRows(primaryRows, ACTIVE_SPOTS, dates);
    const secondary = tideScale === 0.5 ? secondarySummaries(rows) : { sensitivityRunsAt: "06:00 only; primary daily gate" };
    const means = primaryRows.map(row => row.today.byThreshold[70].best?.suitability).filter(has);
    scenarios.push({ tideScale, thresholds, secondary, meanBestSuitability: means.length ? means.reduce((sum, value) => sum + value, 0) / means.length : 0,
      buildHoursCovered: primaryOnly ? [6] : tideScale === 0.5 ? BUILD_HOURS : [6] });
  }
  const base = scenarios.find(scenario => scenario.tideScale === 0.5);
  const at70 = base.thresholds[70];
  const failingCoverage = at70.sourceCoverage.filter(row => row.coverage === null || row.coverage < 0.8);
  const weakestCoverage = at70.sourceCoverage.reduce((weakest, row) => row.coverage === null || row.coverage < weakest.coverage ? row : weakest, at70.sourceCoverage[0]);
  const validMonthShares = at70.monthly.filter(row => row.goShare !== null);
  const highestMonth = validMonthShares.reduce((best, row) => !best || row.goShare > best.share ? { month: row.month, share: row.goShare } : best, null) ?? { month: null, share: null };
  const validSpotShares = at70.spotModes.filter(row => row.goShare !== null);
  const weakestSpotMode = validSpotShares.reduce((best, row) => !best || row.goShare < best.share ? { locationId: row.locationId, mode: row.mode, share: row.goShare } : best, null) ?? { locationId: null, mode: null, share: null };
  const summary = {
    label: REPORT_LABEL, window: { start: dates[0], endInclusive: dates.at(-1), timezone: TZ }, dateKeys: dates,
    mode: primaryOnly ? "primary" : "full", primaryOnly, buildHoursLocal: primaryOnly ? [6] : BUILD_HOURS,
    modeledSpeciesIds: ACTIVE_TARGET_SPECIES.map(species => species.id),
    independentPrimaryDailyBuilds: dates.length, buildCount, candidateThresholds: GO_THRESHOLDS, candidateTideScalesFtPerHr: TIDE_SCALES,
    randomSeed: "not-used; deterministic engine and fixed iteration grid", workerCount, alertAssumption: "unverified/checked-none", sourceHashes, manifestSha256,
    activeLocationModes: ACTIVE_SPOTS.flatMap(spot => spot.modes.map(mode => ({ locationId: spot.id, mode }))), scenarios,
    weakestCoverage: { coverage: weakestCoverage?.coverage ?? null, locationId: weakestCoverage?.locationId ?? null, mode: weakestCoverage?.mode ?? null, month: weakestCoverage?.month ?? null, failingRows: failingCoverage.length },
    highestMonth, weakestSpotMode,
  };
  return summary;
}

function parseDateList(value) {
  const dates = value ? value.split(",").map(part => part.trim()) : DATE_KEYS;
  if (!dates.length || dates.some(day => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day;
  })) throw new Error("--dates must be a comma-separated list of valid YYYY-MM-DD dates.");
  if (new Set(dates).size !== dates.length) throw new Error("--dates cannot contain duplicates.");
  return [...dates].sort();
}

function parseArgs(argv) {
  const options = { primaryOnly: false, merge: false, validate: false, profile: false, dates: null, chunk: null, reportPath: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--primary-only") options.primaryOnly = true;
    else if (arg === "--merge") options.merge = true;
    else if (arg === "--validate") options.validate = true;
    else if (arg === "--profile") options.profile = true;
    else if (["--dates", "--chunk", "--report"].includes(arg)) {
      if (!argv[i + 1]) throw new Error(`${arg} needs a value.`);
      const value = argv[++i];
      if (arg === "--dates") options.dates = value;
      if (arg === "--report") options.reportPath = path.resolve(value);
      if (arg === "--chunk") {
        const match = /^(\d+)\/(\d+)$/.exec(value);
        if (!match) throw new Error("--chunk must use i/n with 1 <= i <= n.");
        options.chunk = { index: Number(match[1]), count: Number(match[2]) };
        if (options.chunk.index < 1 || options.chunk.count < 1 || options.chunk.index > options.chunk.count) throw new Error("--chunk must use 1 <= i <= n.");
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.merge && options.chunk) throw new Error("--merge cannot be combined with --chunk.");
  return options;
}

function datesForChunk(dates, { index, count }) {
  const start = Math.floor((index - 1) * dates.length / count);
  const end = Math.floor(index * dates.length / count);
  return dates.slice(start, end);
}

export async function writeChunk({ dates, records, mode, chunk, manifestSha256, sourceHashes, outputDir = OUTPUT_DIR }) {
  const denominators = chunkDenominators(records, dates);
  const file = path.join(outputDir, `chunk-${mode}-${chunk.index}-of-${chunk.count}.json`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(file, `${stable({ schemaVersion: 1, mode, chunk, dates, manifestSha256, sourceHashes, denominators, records })}\n`);
  return file;
}

export async function mergeChunks({ dates, mode, outputDir = OUTPUT_DIR, reportPath = null, expectedManifestSha256 = null }) {
  const files = (await readdir(outputDir)).filter(name => name.startsWith(`chunk-${mode}-`) && name.endsWith(".json"));
  const info = files.map(name => {
    const match = new RegExp(`^chunk-${mode}-(\\d+)-of-(\\d+)\\.json$`).exec(name);
    return match ? { name, index: Number(match[1]), count: Number(match[2]) } : null;
  }).filter(Boolean).sort((a, b) => a.index - b.index);
  if (!info.length) throw new Error(`No ${mode} chunk files found in ${outputDir}.`);
  const count = info[0].count;
  if (info.length !== count || info.some((part, index) => part.count !== count || part.index !== index + 1)) throw new Error(`Expected exactly ${count} numbered ${mode} chunks; found ${info.length}.`);
  const chunks = await Promise.all(info.map(async part => JSON.parse(await readFile(path.join(outputDir, part.name), "utf8"))));
  const expectedHash = expectedManifestSha256 ?? chunks[0].manifestSha256;
  if (chunks.some(chunk => chunk.mode !== mode || chunk.manifestSha256 !== expectedHash)) throw new Error("Chunk input manifest hash or mode mismatch.");
  if (chunks.some(chunk => stable(chunk.dates) !== stable(datesForChunk(dates, chunk.chunk)))) throw new Error("Chunk date assignments do not match the requested contiguous partition.");
  const combined = chunks.flatMap(chunk => chunk.records).sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour || a.tideScale - b.tideScale);
  const primaryDates = combined.filter(row => row.hour === 6 && row.tideScale === 0.5).map(row => row.day).sort();
  if (stable(primaryDates) !== stable(dates)) throw new Error("Merged chunks must contain every requested date exactly once.");
  const uniqueBuilds = new Set(combined.map(row => `${row.day}|${row.hour}|${row.tideScale}`));
  if (uniqueBuilds.size !== combined.length) throw new Error("Merged chunks contain duplicate build records.");
  const expectedBuilds = dates.length * (mode === "primary" ? TIDE_SCALES.length : TIDE_SCALES.length + 1);
  if (combined.length !== expectedBuilds) throw new Error(`Expected ${expectedBuilds} build records, received ${combined.length}.`);
  const summary = summarizeRecords(combined, dates, { primaryOnly: mode === "primary", manifestSha256: expectedHash, sourceHashes: chunks[0].sourceHashes, workerCount: 1 });
  await mkdir(outputDir, { recursive: true });
  const summaryPath = path.join(outputDir, `summary-${mode}.json`);
  await writeFile(summaryPath, `${stable(summary)}\n`);
  if (reportPath) await writeFile(reportPath, renderReport(summary));
  return summary;
}

export async function runHindcast({ cacheDir = CACHE_DIR, outputDir = OUTPUT_DIR, reportPath = REPORT_PATH, onProgress = () => {}, dates = DATE_KEYS, primaryOnly = false, chunk = null, validate = false } = {}) {
  const cached = await loadCachedInputs(cacheDir);
  const mode = primaryOnly ? "primary" : "full";
  const assignedDates = chunk ? datesForChunk(dates, chunk) : dates;
  const records = [];
  profileBuildTimes.length = 0;
  for (let index = 0; index < assignedDates.length; index++) {
    const day = assignedDates[index];
    const bundle = await buildDayBundle(day, cached, { primaryOnly });
    for (const rows of Object.values(bundle.byScale)) records.push(...rows);
    if (validate) for (const row of records.filter(item => item.day === day)) {
      // Input contracts are already checked in each engine build; this flag adds
      // an explicit normalized-observation validation pass for diagnostic runs.
      const params = candidateParams({ tideScale: row.tideScale });
      const observations = observationsAtInstant(row.day, row.hour, cached, params);
      for (const observation of observations) validateNormalizedObservation(observation);
    }
    onProgress({ completedDays: index + 1, totalDays: assignedDates.length, buildCount: records.length, day });
  }
  if (chunk) {
    const file = await writeChunk({ dates: assignedDates, records, mode, chunk, manifestSha256: cached.manifestSha256, sourceHashes: cached.sourceHashes, outputDir });
    return { mode, buildCount: records.length, chunkFile: file, profileBuildTimes: [...profileBuildTimes] };
  }
  const summary = summarizeRecords(records, dates, { primaryOnly, manifestSha256: cached.manifestSha256, sourceHashes: cached.sourceHashes, workerCount: 1 });
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, `summary-${mode}.json`), `${stable(summary)}\n`);
  await writeFile(path.join(outputDir, "hindcast-results.json"), `${stable(summary)}\n`);
  if (reportPath) await writeFile(reportPath, renderReport(summary));
  return { ...summary, profileBuildTimes: [...profileBuildTimes] };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dates = parseDateList(options.dates);
  const mode = options.primaryOnly ? "primary" : "full";
  if (options.merge) {
    const cached = await loadCachedInputs();
    const summary = await mergeChunks({ dates, mode, expectedManifestSha256: cached.manifestSha256, reportPath: options.reportPath });
    console.log(JSON.stringify({ mode, buildCount: summary.buildCount, summary: path.relative(ROOT, path.join(OUTPUT_DIR, `summary-${mode}.json`)), report: options.reportPath ? path.relative(ROOT, options.reportPath) : null }));
    return;
  }
  const summary = await runHindcast({ dates, primaryOnly: options.primaryOnly, chunk: options.chunk, validate: options.validate, reportPath: options.chunk ? null : options.reportPath ?? REPORT_PATH,
    onProgress: progress => { if (progress.completedDays % 10 === 0 || progress.completedDays === progress.totalDays) console.log(`hindcast progress ${progress.completedDays}/${progress.totalDays} dates; ${progress.buildCount} builds; latest ${progress.day}`); } });
  if (options.profile) {
    const totalMs = summary.profileBuildTimes.reduce((sum, value) => sum + value, 0);
    console.log(`PROFILE modelBuilds=${summary.profileBuildTimes.length} totalMs=${totalMs.toFixed(1)} msPerBuild=${(totalMs / Math.max(1, summary.profileBuildTimes.length)).toFixed(1)}`);
  }
  console.log(JSON.stringify({ mode, buildCount: summary.buildCount, chunk: summary.chunkFile ? path.relative(ROOT, summary.chunkFile) : null,
    summary: summary.chunkFile ? null : path.relative(ROOT, path.join(OUTPUT_DIR, `summary-${mode}.json`)) }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error?.stack ?? error); process.exitCode = 1; });
}
