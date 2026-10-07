import { fetchJson, failure, isStale, observation } from "./shared.js";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const FRESHNESS_MS = 90 * 60 * 1000;
const stamp = (value) => {
  const text = String(value ?? "");
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isFinite(+date) ? date.toISOString() : null;
};
const finiteOrNull = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const forecastTimes = (hourly, fields) => {
  if (!Array.isArray(hourly?.time) || hourly.time.length < 24
    || fields.some((field) => !Array.isArray(hourly[field]) || hourly[field].length !== hourly.time.length)) {
    throw new Error("Open-Meteo hourly forecast is incomplete");
  }
  const times = hourly.time.map(stamp);
  if (times.some((time) => !time) || times.some((time, i) => i > 0 && Date.parse(time) <= Date.parse(times[i - 1]))) {
    throw new Error("Open-Meteo forecast times are invalid");
  }
  return times;
};
const hourlyRows = (hourly, fields) => {
  const times = forecastTimes(hourly, fields);
  return times.map((validFrom, i) => ({
    validFrom,
    validTo: new Date(Date.parse(validFrom) + 60 * 60 * 1000).toISOString(),
    temperature: finiteOrNull(hourly.temperature_2m[i]),
    windSpeed: finiteOrNull(hourly.wind_speed_10m[i]),
    windGust: finiteOrNull(hourly.wind_gusts_10m[i]),
    windDirection: finiteOrNull(hourly.wind_direction_10m[i]),
    probabilityOfPrecipitation: finiteOrNull(hourly.precipitation_probability[i]),
  }));
};
const asGrid = (field, rows) => rows.map((row) => ({ validFrom: row.validFrom, validTo: row.validTo, value: row[field] }));

export async function fetchOpenMeteoWeather(location, { fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const locationId = location?.id ?? null;
  const url = new URL(WEATHER_URL);
  url.search = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    forecast_days: "7",
    timezone: "UTC",
  });

  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
    const rows = hourlyRows(json?.hourly, [
      "temperature_2m", "precipitation_probability", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
    ], now);
    const fetchedAt = new Date(now).toISOString();
    const shared = { provider: "open-meteo", locationId, url: url.toString(), fetchedAt, usedFallback: true,
      stale: isStale(fetchedAt, FRESHNESS_MS, now) };
    const commonRows = rows.map((row) => ({ ...row, temperatureUnit: "F" }));
    const grid = observation({ ...shared, kind: "gridForecast",
      validFrom: rows[0].validFrom, validTo: rows.at(-1).validTo,
      units: { temperature: "°F", windSpeed: "mph", windGust: "mph", windDirection: "degrees", probabilityOfPrecipitation: "%" },
      values: {
        temperature: asGrid("temperature", rows),
        windSpeed: asGrid("windSpeed", rows),
        windGust: asGrid("windGust", rows),
        windDirection: asGrid("windDirection", rows),
        probabilityOfPrecipitation: asGrid("probabilityOfPrecipitation", rows),
        probabilityOfThunder: [],
      } });
    const hourly = observation({ ...shared, kind: "hourlyForecast",
      validFrom: rows[0].validFrom, validTo: rows.at(-1).validTo,
      units: "Open-Meteo hourly values; wind mph; temperature °F",
      values: { rows: commonRows.map((row) => ({ ...row, startTime: row.validFrom, endTime: row.validTo })) } });
    return { hourly, grid };
  } catch (error) {
    return {
      hourly: failure({ provider: "open-meteo", kind: "hourlyForecast", locationId, url: url.toString() }, error),
      grid: failure({ provider: "open-meteo", kind: "gridForecast", locationId, url: url.toString() }, error),
    };
  }
}

export async function fetchOpenMeteoMarineForecast(location, { fetchImpl, now = Date.now(), timeoutMs = 8000 } = {}) {
  const locationId = location?.id ?? null;
  const url = new URL(MARINE_URL);
  url.search = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    hourly: "wave_height,wave_period,wave_direction",
    forecast_days: "7",
    timezone: "UTC",
  });
  try {
    const { json } = await fetchJson(url, { fetchImpl, timeoutMs });
    const values = json?.hourly;
    const times = forecastTimes(values, ["wave_height", "wave_period", "wave_direction"]);
    const rows = times.map((validFrom, i) => ({
      validFrom,
      validTo: new Date(Date.parse(validFrom) + 60 * 60 * 1000).toISOString(),
      waveHeightM: finiteOrNull(values.wave_height[i]),
      periodS: finiteOrNull(values.wave_period[i]),
      directionDeg: finiteOrNull(values.wave_direction[i]),
    }));
    if (!rows.some((row) => Number.isFinite(row.waveHeightM))) throw new Error("Open-Meteo wave heights are unavailable");
    const fetchedAt = new Date(now).toISOString();
    return observation({
      provider: "open-meteo",
      kind: "waveForecast",
      locationId,
      url: url.toString(),
      fetchedAt,
      validFrom: times[0],
      validTo: rows.at(-1).validTo,
      units: { waveHeightM: "m", periodS: "s", directionDeg: "degrees" },
      values: { rows },
      usedFallback: true,
      stale: isStale(fetchedAt, FRESHNESS_MS, now),
    });
  } catch (error) {
    return failure({ provider: "open-meteo", kind: "waveForecast", locationId, url: url.toString() }, error);
  }
}
