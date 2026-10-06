const TIME_ZONE = "America/New_York";
const REPORT_CURRENT_KEY = "current-report";
const REPORT_NEXT_DAY_KEY = "next-day-report";
const LIVE_CACHE_MS = 120_000;
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_SOURCE_BYTES = 512_000;
const USER_AGENT = "FlaglerFishingReport/1.0 (read-only public data sources)";
const APPROVED_HOSTS = new Set([
  "api.weather.gov",
  "www.ndbc.noaa.gov",
  "api.tidesandcurrents.noaa.gov",
  "captainexperiences.com",
]);
const NWS_OBSERVATION_URL = "https://api.weather.gov/stations/KFIN/observations/latest";
const NWS_FORECAST_URL = "https://api.weather.gov/gridpoints/JAX/89,29/forecast";
const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active?point=29.4738,-81.131";
const NWS_CWF_LIST_URL = "https://api.weather.gov/products/types/CWF/locations/JAX";
const NDBC_URL = "https://www.ndbc.noaa.gov/data/realtime2/41117.txt";
const NOAA_TIDES_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const CAPTAIN_REPORTS_URL = "https://captainexperiences.com/fishing-reports/locations/regions/flagler-beach";
const FLAGLER_LAT = 29.4749754;
const FLAGLER_LON = -81.1270035;
const liveCache = new Map();

class UpstreamError extends Error {}

function utcNow() {
  return new Date().toISOString();
}

function number(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function formatLocalParts(date) {
  const entries = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const parts = Object.fromEntries(entries.map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function localDate(date) {
  const p = formatLocalParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function addCalendarDays(isoDate, count) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + count, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatOffset(offsetMs) {
  const minutes = Math.round(offsetMs / 60_000);
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

// NOAA's lst_ldt predictions are local wall-clock strings without an offset.
function noaaLocalTimeToIso(dateText, timeText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const atGuess = formatLocalParts(new Date(wallClockAsUtc));
  const guessOffset = Date.UTC(atGuess.year, atGuess.month - 1, atGuess.day, atGuess.hour, atGuess.minute, atGuess.second) - wallClockAsUtc;
  const instant = wallClockAsUtc - guessOffset;
  const atInstant = formatLocalParts(new Date(instant));
  const actualOffset = Date.UTC(atInstant.year, atInstant.month - 1, atInstant.day, atInstant.hour, atInstant.minute, atInstant.second) - instant;
  const offset = formatOffset(actualOffset);
  return `${dateText}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
}

function displayDate(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function displayLocalTime(isoTime) {
  const date = new Date(isoTime);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

async function fetchText(url, options = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !APPROVED_HOSTS.has(parsed.hostname)) {
    throw new UpstreamError("Unapproved data source.");
  }
  const headers = {
    Accept: options.accept || "application/geo+json, application/json, text/plain;q=0.9, */*;q=0.8",
    "User-Agent": USER_AGENT,
  };
  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(parsed, {
        headers,
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location");
        if (!location) throw new UpstreamError("Data source returned an invalid redirect.");
        const redirected = new URL(location, parsed);
        if (redirected.protocol !== "https:" || redirected.origin !== parsed.origin) {
          throw new UpstreamError("Data source redirected outside its approved host.");
        }
        response = await fetch(redirected, {
          headers,
          signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
          redirect: "error",
        });
      }
      if (response.ok) break;
      if (attempt === 2 || (response.status < 500 && response.status !== 429)) {
        throw new UpstreamError(`Data source returned HTTP ${response.status}.`);
      }
      lastError = new UpstreamError(`Data source returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt === 2 || (error instanceof UpstreamError && !/HTTP (429|5\d\d)\./.test(error.message))) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  if (!response || !response.ok) throw lastError || new UpstreamError("Data source request failed.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > (options.maxBytes || MAX_SOURCE_BYTES)) {
    throw new UpstreamError("Data source response exceeded the size limit.");
  }
  return { text, lastModified: response.headers.get("Last-Modified") };
}

async function fetchJson(url) {
  const { text } = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError("Data source returned invalid JSON.");
  }
}

function freshnessWithinMinutes(value, minutes) {
  if (!value || typeof value !== "string") return false;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return false;
  return Date.now() - stamp <= minutes * 60_000;
}

async function fetchWeatherForecastLive() {
  try {
    const forecast = await fetchNwsForecast();
    const future = forecast.periods.filter((period) => {
      const end = Date.parse(period.endTime || "");
      return Number.isFinite(end) && end > Date.now();
    });
    const daytime = future.find((period) => period.isDaytime === true && temperatureF(period) !== null);
    const nighttime = future.find((period) => period.isDaytime === false && temperatureF(period) !== null);
    const result = { fetched_at: forecast.fetchedAt };
    if (forecast.properties.updateTime) result.updated_at = forecast.properties.updateTime;
    if (daytime) {
      result.high_f = rounded(temperatureF(daytime));
      result.high_period = daytime.name;
    }
    if (nighttime) {
      result.low_f = rounded(temperatureF(nighttime));
      result.low_period = nighttime.name;
    }
    for (const period of future) {
      const probability = number(period.probabilityOfPrecipitation && period.probabilityOfPrecipitation.value);
      if (probability !== null && probability >= 0 && probability <= 100) {
        result.precipitation_probability_pct = probability;
        result.precipitation_period = period.name;
        break;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function observationWindSpeedMs(properties, key) {
  const item = properties[key];
  if (!item || number(item.value) === null) return null;
  const value = number(item.value);
  if (item.unitCode === "wmoUnit:m_s-1") return value;
  if (item.unitCode === "wmoUnit:km_h-1") return value / 3.6;
  return null;
}

async function fetchWeatherObservation() {
  const payload = await fetchJson(NWS_OBSERVATION_URL);
  const properties = payload && payload.properties;
  if (!properties || typeof properties.timestamp !== "string") {
    throw new UpstreamError("NWS observation response is incomplete.");
  }
  if (!freshnessWithinMinutes(properties.timestamp, 90)) {
    throw new UpstreamError(`NWS weather observation is stale: ${properties.timestamp}`);
  }
  return {
    observedAt: properties.timestamp,
    temperatureC: number(properties.temperature && properties.temperature.value),
    windSpeedMs: observationWindSpeedMs(properties, "windSpeed"),
    windGustMs: observationWindSpeedMs(properties, "windGust"),
    windDirectionDeg: number(properties.windDirection && properties.windDirection.value),
    description: typeof properties.textDescription === "string" ? properties.textDescription : null,
  };
}

async function fetchWeatherLive() {
  const payload = await fetchJson(NWS_OBSERVATION_URL);
  const properties = payload && payload.properties;
  if (!properties || typeof properties.timestamp !== "string") {
    throw new UpstreamError("NWS observation response is incomplete.");
  }
  if (!freshnessWithinMinutes(properties.timestamp, 90)) {
    throw new UpstreamError(`NWS weather observation is stale: ${properties.timestamp}`);
  }
  const measured = (key) => number(properties[key] && properties[key].value);
  const heatIndex = measured("heatIndex");
  const windChill = measured("windChill");
  const temperature = measured("temperature");
  const values = {
    temperature_c: temperature,
    dewpoint_c: measured("dewpoint"),
    wind_speed_ms: observationWindSpeedMs(properties, "windSpeed"),
    wind_gust_ms: observationWindSpeedMs(properties, "windGust"),
    wind_direction_deg: measured("windDirection"),
    wind_chill_c: windChill,
    heat_index_c: heatIndex,
    relative_humidity_pct: measured("relativeHumidity"),
    text_description: typeof properties.textDescription === "string" ? properties.textDescription : null,
  };
  if (heatIndex !== null) {
    values.feels_like_c = heatIndex;
    values.feels_like_basis = "heat index";
  } else if (windChill !== null) {
    values.feels_like_c = windChill;
    values.feels_like_basis = "wind chill";
  } else if (temperature !== null) {
    values.feels_like_c = temperature;
    values.feels_like_basis = "same as air temp";
  }
  return {
    ok: true,
    source: "National Weather Service",
    station: "KFIN · Flagler County Airport",
    station_note: "Nearby airport observation; not beach wind.",
    observed_at: properties.timestamp,
    fetched_at: utcNow(),
    values,
    forecast: await fetchWeatherForecastLive(),
  };
}

function parseBuoy(raw, modified) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.find((line) => line.startsWith("#YY"));
  if (!header) throw new UpstreamError("NDBC buoy header is missing.");
  const columns = header.split(/\s+/).map((column) => column.replace(/^#/, ""));
  const row = lines.find((line) => !line.startsWith("#") && line.split(/\s+/).length >= columns.length);
  if (!row) throw new UpstreamError("NDBC buoy observation is missing.");
  const values = row.split(/\s+/);
  const record = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  const bounded = (key, low, high) => {
    const value = number(record[key]);
    return value !== null && value >= low && value <= high ? value : null;
  };
  let observed = null;
  const year = number(record.YY);
  if (year !== null) {
    const fullYear = year < 100 ? 2000 + year : year;
    const stamp = Date.UTC(fullYear, Number(record.MM) - 1, Number(record.DD), Number(record.hh), Number(record.mm || 0));
    if (Number.isFinite(stamp)) observed = new Date(stamp).toISOString();
  }
  if (!observed && modified) {
    const parsed = new Date(modified);
    if (Number.isFinite(parsed.getTime())) observed = parsed.toISOString();
  }
  if (!observed) throw new UpstreamError("NDBC observation timestamp is missing.");
  if (!freshnessWithinMinutes(observed, 90)) {
    throw new UpstreamError(`NDBC marine observation is stale: ${observed}`);
  }
  return {
    ok: true,
    source: "NOAA National Data Buoy Center",
    station: "41117 · St. Augustine offshore buoy",
    station_note: "Offshore observation; conditions may differ at shore.",
    observed_at: observed,
    fetched_at: utcNow(),
    values: {
      wave_height_m: bounded("WVHT", 0, 100),
      dominant_period_s: bounded("DPD", 0, 100),
      average_period_s: bounded("APD", 0, 100),
      water_temperature_c: bounded("WTMP", -10, 50),
      wind_speed_ms: bounded("WSPD", 0, 100),
      wind_gust_ms: bounded("GST", 0, 100),
      wind_direction_deg: bounded("WDIR", 0, 360),
    },
  };
}

async function fetchTidesLive() {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const beginDate = localDate(now);
  const endDate = localDate(end);
  const predictions = tideEvents(await fetchTidePredictions(beginDate, endDate));
  const events = predictions.filter((event) => {
    const stamp = Date.parse(event.time);
    return stamp >= now.getTime() && stamp <= end.getTime();
  });
  if (events.length < 4) {
    throw new UpstreamError(`NOAA tide predictions returned only ${events.length} events in the next 24 hours.`);
  }
  return {
    ok: true,
    source: "NOAA CO-OPS tide predictions",
    station: "8720833 · Smith Creek",
    station_note: "Predicted tides only; this station has no current water-level gauge.",
    observed_at: null,
    prediction_date: beginDate,
    prediction_end_date: endDate,
    fetched_at: utcNow(),
    datum: "MLLW",
    events,
  };
}

// The remainder of the file is unchanged from the original implementation.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    const local = formatLocalParts(new Date(controller.scheduledTime));
    const isMorning = controller.cron === CRON_MORNING && local.hour === 6;
    const isNextDay = controller.cron === CRON_NEXT_DAY && local.hour === 19;
    if (!isMorning && !isNextDay) {
      console.log(`[schedule] skipped ${controller.cron} at ${localDate(new Date(controller.scheduledTime))} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")} ${TIME_ZONE}`);
      return;
    }
    const kind = isMorning ? "morning" : "next-day";
    ctx.waitUntil(runScheduledPipeline(env, kind, controller.scheduledTime).catch((error) => {
      console.error(`[schedule] ${kind} report pipeline failed; last successfully stored KV report was preserved`, error instanceof Error ? error.message : "unknown error");
      throw error;
    }));
  },
};

