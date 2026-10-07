import { fetchNwsPoints } from "./adapters/nws-points.js";
import { fetchNwsHourly } from "./adapters/nws-hourly.js";
import { fetchNwsGridForecast } from "./adapters/nws-grid-forecast.js";
import { fetchNwsAlerts } from "./adapters/nws-alerts.js";
import { fetchNwsObservations } from "./adapters/nws-observations.js";
import { fetchCoopsPredictions } from "./adapters/coops-predictions.js";
import { fetchCoopsWaterTemperature } from "./adapters/coops-water-temperature.js";
import { fetchSecoora } from "./adapters/secoora.js";
import { fetchNdbcFallback } from "./adapters/ndbc-fallback.js";
import { fetchNwsWaveForecast } from "./adapters/nws-wave.js";
import { fetchOpenMeteoMarineForecast, fetchOpenMeteoWeather } from "./adapters/open-meteo.js";

const cache = new Map();
export function clearSourceCache() { cache.clear(); }
const TTL = { points: 7*86400000, hourly: 30*60000, grid: 30*60000, alerts: 10*60000,
  observations: 15*60000, tide: 6*3600000, waterTemperature: 30*60000, buoy: 30*60000 };
const STALE_MAX = { points: 30*86400000, hourly: 6*3600000, grid: 6*3600000, alerts: 60*60000,
  observations: 60*60000, tide: 24*3600000, waterTemperature: 3*3600000, buoy: 3*3600000 };

async function cached(key, kind, now, fetcher) {
  const old = cache.get(key), age = old ? now - Date.parse(old.fetchedAt) : Infinity;
  if (old && age <= TTL[kind]) return { ...old, cacheHit: true };
  try {
    const fresh = await fetcher();
    if (fresh?.ok) { cache.set(key, fresh); return fresh; }
    if (old && age <= STALE_MAX[kind]) return { ...old, stale: true, error: fresh?.error ?? "Refresh failed; serving stale cache", cacheHit: true };
    return fresh;
  } catch (error) {
    if (old && age <= STALE_MAX[kind]) return { ...old, stale: true, error: String(error.message ?? error), cacheHit: true };
    return { provider: "internal", kind, locationId: null, station: null, units: null, observedAt: null, issuedAt: null,
      validFrom: null, validTo: null, fetchedAt: new Date(now).toISOString(), values: null, ok: false, stale: false,
      usedFallback: false, error: String(error.message ?? error) };
  }
}

export async function fetchSources({ locations = [], fetchImpl = globalThis.fetch, now = Date.now(), timeoutMs = 8000,
  ndbcUrl, includeWaveForecast = true } = {}) {
  const all = [];
  await Promise.all(locations.map(async location => {
    const id = location.id ?? String(location.lat) + "," + String(location.lon);
    const points = await cached("points-land:" + id, "points", now, () => fetchNwsPoints(location, { fetchImpl, now, timeoutMs }));
    const marine = includeWaveForecast && location.modes?.some(mode => mode === "surf" || mode === "pier");
    const marineCoordinates = marine ? { lat: location.lat, lon: Number((Number(location.lon) + 0.05).toFixed(4)) } : null;
    const marinePoints = marine ? await cached("points-marine:" + id, "points", now,
      () => fetchNwsPoints(location, { fetchImpl, now, timeoutMs, marine: true, coordinates: marineCoordinates })) : null;
    const secooraPromise = fetchSecoora(location, { fetchImpl, now, timeoutMs });
    const jobs = [
      ["hourly", "hourly:" + id, () => fetchNwsHourly(location, { points, fetchImpl, now, timeoutMs })],
      ["grid", "land-grid:" + id, () => fetchNwsGridForecast(location, { points, fetchImpl, now, timeoutMs })],
      ["alerts", "alerts:" + id, () => fetchNwsAlerts(location, { fetchImpl, now, timeoutMs })],
      ["observations", "observations:" + id, () => fetchNwsObservations(location, { points, fetchImpl, now, timeoutMs })],
      ["tide", "tide:" + location.tide + ":" + id, () => fetchCoopsPredictions(location, { fetchImpl, now, timeoutMs })],
      ["waterTemperature", "coops-water:" + (location.waterTemp ?? id), () => fetchCoopsWaterTemperature(location, { fetchImpl, now, timeoutMs })],
      ["buoy", "secoora-waves:" + location.cdip + ":" + id, async () => (await secooraPromise).waves],
      ["buoy", "secoora-water:" + location.cdip + ":" + id, async () => (await secooraPromise).water],
    ];
    if (marine) {
      jobs.push(["grid", "grid:" + id, () => fetchNwsWaveForecast(location, { points: marinePoints, fetchImpl, now, timeoutMs })]);
    }
    const results = await Promise.all(jobs.map(async ([kind,key,fn]) => cached(key, kind, now, fn)));
    let [hourly, landGrid, alerts, pressure, tide, coopsWater, secooraWaves, secooraWater, waveForecast] = results;
    if (!hourly?.ok || hourly.stale || !landGrid?.ok || landGrid.stale) {
      const fallback = await fetchOpenMeteoWeather(location, { fetchImpl, now, timeoutMs });
      if ((!hourly?.ok || hourly.stale) && fallback.hourly.ok) hourly = fallback.hourly;
      if ((!landGrid?.ok || landGrid.stale) && fallback.grid.ok) landGrid = fallback.grid;
    }
    if (marine && (!waveForecast?.ok || waveForecast.stale)) {
      const fallback = await fetchOpenMeteoMarineForecast(
        { ...location, lon: marineCoordinates.lon }, { fetchImpl, now, timeoutMs },
      );
      if (fallback.ok) waveForecast = fallback;
    }
    const buoyOk = obs => obs?.ok && !obs.stale && Number.isFinite(Date.parse(obs.observedAt)) && now - Date.parse(obs.observedAt) <= 3*3600000;
    let ndbc = null;
    const waves = buoyOk(secooraWaves) ? secooraWaves : (ndbc ??= await fetchNdbcFallback(location, { fetchImpl, now, timeoutMs, url: ndbcUrl }));
    const water = buoyOk(secooraWater) ? secooraWater : (ndbc ??= await fetchNdbcFallback(location, { fetchImpl, now, timeoutMs, url: ndbcUrl }));
    const fallbackWaves = waves?.provider === "ndbc" ? { ...waves, kind: "waves", values: { waveHeightM: waves.values?.waveHeightM,
      periodS: waves.values?.periodS, directionDeg: waves.values?.directionDeg } } : waves;
    const fallbackWater = water?.provider === "ndbc" ? { ...water, kind: "waterTemperature", values: { temperatureC: water.values?.temperatureC } } : water;
    all.push(points, marinePoints, hourly, landGrid, alerts, pressure, tide, coopsWater, fallbackWaves, fallbackWater, waveForecast);
  }));
  return all.filter(Boolean);
}

export const sourceCachePolicy = Object.freeze({ ttlMs: { ...TTL }, staleOnErrorMaxMs: { ...STALE_MAX } });
