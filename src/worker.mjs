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

async function fetchNwsForecast() {
  const payload = await fetchJson(NWS_FORECAST_URL);
  const properties = payload && payload.properties;
  if (!properties || !Array.isArray(properties.periods)) {
    throw new UpstreamError("NWS forecast response is missing forecast periods.");
  }
  return {
    properties,
    periods: properties.periods.filter((period) => period && typeof period === "object"),
    fetchedAt: utcNow(),
  };
}

function temperatureF(period) {
  const value = number(period.temperature);
  if (value === null) return null;
  if (period.temperatureUnit === "F") return value;
  if (period.temperatureUnit === "C") return value * 9 / 5 + 32;
  return null;
}

function rounded(value) {
  return value === null ? null : Math.round(value);
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

async function fetchBuoy() {
  const { text, lastModified } = await fetchText(NDBC_URL, { accept: "text/plain" });
  return parseBuoy(text, lastModified);
}

async function fetchTidePredictions(beginDate, endDate, station = "8720833") {
  const params = new URLSearchParams({
    begin_date: beginDate.replaceAll("-", ""),
    end_date: endDate.replaceAll("-", ""),
    station,
    product: "predictions",
    datum: "MLLW",
    time_zone: "gmt",
    units: "english",
    interval: "hilo",
    format: "json",
  });
  const payload = await fetchJson(`${NOAA_TIDES_URL}?${params}`);
  if (!payload || !Array.isArray(payload.predictions)) {
    throw new UpstreamError("NOAA tide predictions are missing.");
  }
  return payload.predictions.filter((item) => item && typeof item.t === "string");
}

function tideEvents(predictions) {
  return predictions.flatMap((item) => {
    const height = number(item.v);
    const match = item.t.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
    if (height === null || !match || !["H", "L"].includes(item.type)) return [];
    const time = new Date(`${match[1]}T${match[2]}:00Z`).toISOString();
    return [{ time, height_ft: height, type: item.type === "H" ? "High" : "Low" }];
  });
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

function dayOfYear(year, month, day) {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86_400_000);
}

function solarEventUtc(targetDate, latitude, longitude, sunrise) {
  const [year, month, day] = targetDate.split("-").map(Number);
  const ordinal = dayOfYear(year, month, day);
  const longitudeHour = longitude / 15;
  const approximateTime = ordinal + ((sunrise ? 6 : 18) - longitudeHour) / 24;
  const meanAnomaly = 0.9856 * approximateTime - 3.289;
  const trueLongitude = ((meanAnomaly
    + 1.916 * Math.sin(meanAnomaly * Math.PI / 180)
    + 0.020 * Math.sin(2 * meanAnomaly * Math.PI / 180)
    + 282.634) % 360 + 360) % 360;
  let rightAscension = Math.atan(0.91764 * Math.tan(trueLongitude * Math.PI / 180)) * 180 / Math.PI;
  rightAscension = ((rightAscension % 360) + 360) % 360;
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
  rightAscension /= 15;
  const sinDeclination = 0.39782 * Math.sin(trueLongitude * Math.PI / 180);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const latitudeRadians = latitude * Math.PI / 180;
  const cosHourAngle = (Math.cos(90.833 * Math.PI / 180) - sinDeclination * Math.sin(latitudeRadians))
    / (cosDeclination * Math.cos(latitudeRadians));
  if (cosHourAngle > 1 || cosHourAngle < -1) return null;
  const hourAngle = (sunrise ? 360 - Math.acos(cosHourAngle) * 180 / Math.PI : Math.acos(cosHourAngle) * 180 / Math.PI) / 15;
  const localMeanTime = hourAngle + rightAscension - 0.06571 * approximateTime - 6.622;
  const utcHour = ((localMeanTime - longitudeHour) % 24 + 24) % 24;
  const wholeHours = Math.floor(utcHour);
  const minutes = (utcHour - wholeHours) * 60;
  const seconds = (minutes - Math.floor(minutes)) * 60;
  const base = Date.UTC(year, month - 1, day, wholeHours, Math.floor(minutes), Math.round(seconds));
  const instant = new Date(base);
  const local = localDate(instant);
  const shifted = base + (local < targetDate ? 86400e3 : local > targetDate ? -86400e3 : 0);
  return new Date(shifted).toISOString();
}

function sunriseSunset(targetDate) {
  return {
    sunrise: solarEventUtc(targetDate, FLAGLER_LAT, FLAGLER_LON, true),
    sunset: solarEventUtc(targetDate, FLAGLER_LAT, FLAGLER_LON, false),
  };
}

function decodeHtml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
    if (name[0] === "#") {
      const codePoint = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[name.toLowerCase()] || entity;
  });
}

function parseCaptainReports(html) {
  const reports = [];
  const pattern = /<div class="text-lg">([^<]+)<\/div>\s*<div class="text-lg">Reported\s+([^<]+)<\/div>[\s\S]{0,6000}?<div class="text-xl(?:\s+[^\"]*)?">([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    const clean = (value) => decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    const location = clean(match[1]);
    const reported = clean(match[2]);
    const text = clean(match[3]);
    if (!text || /^see full report/i.test(text)) continue;
    if (reports.some((item) => item.text === text)) continue;
    reports.push({ location, reported, text });
    if (reports.length === 4) break;
  }
  return reports;
}

async function fetchCaptainReports() {
  const { text, lastModified } = await fetchText(CAPTAIN_REPORTS_URL, {
    accept: "text/html",
    maxBytes: 750_000,
  });
  const reports = parseCaptainReports(text);
  if (!reports.length) throw new UpstreamError("Captain Experiences report cards could not be parsed.");
  return { reports, lastModified, fetchedAt: utcNow() };
}

async function fetchActiveAlerts() {
  const payload = await fetchJson(NWS_ALERTS_URL);
  if (!payload || !Array.isArray(payload.features)) {
    throw new UpstreamError("NWS alert response is incomplete.");
  }
  return payload.features.map((feature) => feature && feature.properties).filter(Boolean);
}

function marineZoneBlock(productText) {
  const lines = productText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].trim();
    if (!/^AMZ\d{3}(?:-\d{3})*-\d{6}-$/.test(header)) continue;
    const zoneList = header.replace(/-\d{6}-$/, "").replace(/^AMZ/, "").split("-");
    if (!zoneList.includes("454")) continue;
    const section = [];
    for (let cursor = index + 1; cursor < lines.length && lines[cursor].trim() !== "$$"; cursor += 1) {
      section.push(lines[cursor]);
    }
    return section.join("\n");
  }
  return "";
}

async function fetchCoastalForecast(targetDate) {
  const payload = await fetchJson(NWS_CWF_LIST_URL);
  const products = Array.isArray(payload && payload["@graph"]) ? payload["@graph"] : [];
  const latest = products
    .filter((item) => item && typeof item.id === "string" && item.productCode === "CWF")
    .sort((a, b) => Date.parse(b.issuanceTime || "") - Date.parse(a.issuanceTime || ""))[0];
  if (!latest) throw new UpstreamError("NWS coastal waters forecast product is missing.");
  const product = await fetchJson(`https://api.weather.gov/products/${encodeURIComponent(latest.id)}`);
  if (!product || typeof product.productText !== "string") {
    throw new UpstreamError("NWS coastal waters forecast text is missing.");
  }
  const block = marineZoneBlock(product.productText);
  if (!block) throw new UpstreamError("NWS AMZ454 forecast section is missing.");
  const issueDate = latest.issuanceTime ? localDate(new Date(latest.issuanceTime)) : "";
  const targetWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" })
    .format(new Date(`${targetDate}T12:00:00Z`)).toUpperCase();
  const periodPattern = /^\.([^.]*)\.\.\.\s*(.*)$/;
  const periods = [];
  let current = null;
  for (const line of block.split(/\r?\n/)) {
    const match = line.trim().match(periodPattern);
    if (match) {
      if (current) periods.push(current);
      current = { name: match[1].trim().toUpperCase(), lines: [match[2].trim()] };
    } else if (current && line.trim()) {
      current.lines.push(line.trim());
    }
  }
  if (current) periods.push(current);
  const selected = periods.filter((period) => {
    if (period.name.includes(targetWeekday)) return true;
    return targetDate === issueDate && /^(TODAY|TONIGHT|REST OF TODAY|REST OF TONIGHT)\b/.test(period.name);
  });
  return selected.map((period) => `${period.name}: ${period.lines.join(" ").replace(/\s+/g, " ").trim()}`)
    .filter((text) => !text.endsWith(":"));
}

function periodStartsOn(period, date) {
  return typeof period.startTime === "string" && period.startTime.slice(0, 10) === date;
}

function reportWeather(periods, targetDate) {
  const matching = periods.filter((period) => periodStartsOn(period, targetDate));
  const daytime = matching.find((period) => period.isDaytime === true && temperatureF(period) !== null);
  const nightPeriods = matching.filter((period) => period.isDaytime === false && temperatureF(period) !== null);
  const nighttime = [...nightPeriods].sort((left, right) => Date.parse(left.startTime || "") - Date.parse(right.startTime || "")).at(-1);
  const precipitation = matching
    .map((period) => ({ period, value: number(period.probabilityOfPrecipitation && period.probabilityOfPrecipitation.value) }))
    .filter((item) => item.value !== null && item.value >= 0 && item.value <= 100);
  const high = daytime ? rounded(temperatureF(daytime)) : null;
  const low = nighttime ? rounded(temperatureF(nighttime)) : null;
  const rain = precipitation.length ? Math.max(...precipitation.map((item) => item.value)) : null;
  const wind = [daytime, nighttime].filter(Boolean).map((period) => {
    const direction = typeof period.windDirection === "string" ? period.windDirection : "";
    const speed = typeof period.windSpeed === "string" ? period.windSpeed : "";
    return [period.name, [direction, speed].filter(Boolean).join(" winds ")].filter(Boolean).join(": ");
  });
  const descriptions = [daytime, nighttime].filter(Boolean)
    .map((period) => typeof period.shortForecast === "string" ? `${period.name}: ${period.shortForecast}` : "");
  return { matching, high, low, rain, precipitation, wind, descriptions };
}

function activeAlertsForDate(alerts, targetDate) {
  const dayStart = Date.parse(noaaLocalTimeToIso(targetDate, "00:00"));
  const nextStart = Date.parse(noaaLocalTimeToIso(addCalendarDays(targetDate, 1), "00:00"));
  return alerts.filter((alert) => {
    const starts = Date.parse(alert.effective || alert.onset || "") || Number.NEGATIVE_INFINITY;
    const ends = Date.parse(alert.expires || "") || Number.POSITIVE_INFINITY;
    return starts < nextStart && ends > dayStart;
  });
}

function formatBuoy(values) {
  const parts = [];
  if (values.wave_height_m !== null) parts.push(`combined wave height about ${values.wave_height_m.toFixed(1)} m`);
  if (values.dominant_period_s !== null) parts.push(`dominant period ${Math.round(values.dominant_period_s)} s`);
  if (values.wind_speed_ms !== null) parts.push(`wind ${Math.round(values.wind_speed_ms * 1.94384)} kt`);
  if (values.wind_gust_ms !== null) parts.push(`gusts ${Math.round(values.wind_gust_ms * 1.94384)} kt`);
  if (values.water_temperature_c !== null) parts.push(`water ${Math.round(values.water_temperature_c * 9 / 5 + 32)}°F`);
  return parts.join("; ");
}

function tideSummaryForWindow(tides, startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const items = tides.filter((event) => {
    const stamp = Date.parse(event.time);
    return stamp >= start && stamp <= end;
  });
  return items.length
    ? items.map((event) => `${event.type} near ${displayLocalTime(event.time)} (${event.height_ft.toFixed(1)} ft)`).join(", ")
    : "no predicted high/low event in this interval";
}

function renderReport({ targetDate, preview, weather, observation, coastal, buoy, tides, alerts, captain, sun, sourceAvailability }) {
  const details = reportWeather(weather.periods, targetDate);
  const lines = [
    `Palm Coast / Flagler Beach — ${displayDate(targetDate)}`,
    "",
    `Report type: ${preview ? "Next-Day Preview" : "Morning Report"}`,
    "",
  ];
  lines.push("Weather — Palm Coast");
  lines.push(`• Official NWS forecast for ${displayDate(targetDate)}: ${details.high === null ? "high unavailable" : `high near ${details.high}°F`}; ${details.low === null ? "overnight low unavailable" : `overnight low near ${details.low}°F`}.`);
  if (details.rain !== null) lines.push(`• Rain/precipitation: maximum forecast probability ${Math.round(details.rain)}% across the NWS periods for this date${details.precipitation.map((item) => `; ${item.period.name} ${Math.round(item.value)}%`).join("")}.`);
  else lines.push("• Rain/precipitation: probability unavailable in NWS periods for this date.");
  if (details.wind.length) lines.push(`• Forecast wind speed/direction: ${details.wind.join("; ")}.`);
  else lines.push("• Forecast wind speed/direction: unavailable in NWS periods for this date.");
  if (observation) {
    const observedParts = [];
    if (observation.temperatureC !== null) observedParts.push(`${Math.round(observation.temperatureC * 9 / 5 + 32)}°F`);
    if (observation.windSpeedMs !== null) observedParts.push(`wind ${Math.round(observation.windSpeedMs * 2.23694)} mph`);
    if (observation.windGustMs !== null) observedParts.push(`gust ${Math.round(observation.windGustMs * 2.23694)} mph`);
    if (observation.windDirectionDeg !== null) observedParts.push(`direction ${Math.round(observation.windDirectionDeg)}°`);
    lines.push(`• Latest KFIN airport observation (${observation.observedAt}): ${observedParts.join(", ") || observation.description || "conditions unavailable"}. This is an airport reading, not a beach observation.`);
  }
  if (details.descriptions.length) lines.push(`• Forecast conditions: ${details.descriptions.join("; ")}.`);
  lines.push("• Practical note: NWS point periods provide the weather forecast; airport, beach, and offshore conditions can differ. Recheck official updates before departure.", "");

  lines.push("Fishing Conditions — Flagler Beach");
  if (coastal.length) {
    lines.push(`• Surf/marine: NWS AMZ454 coastal waters forecast — ${coastal.join("; ")}. This is an offshore marine-zone forecast, not a measured beach shorebreak.`);
  } else {
    lines.push("• Surf/marine: NWS AMZ454 forecast section was unavailable for this date.");
  }
  if (buoy && formatBuoy(buoy.values)) {
    const wave = formatBuoy(buoy.values);
    const windDirection = buoy.values.wind_direction_deg === null ? "" : `; wind direction ${Math.round(buoy.values.wind_direction_deg)}°`;
    lines.push(`• Surf/marine buoy data: NOAA/NDBC 41117 observed ${wave}${windDirection} at ${buoy.observed_at}. Offshore readings may differ at Flagler Beach.`);
  } else {
    lines.push("• Surf/marine buoy data: NOAA/NDBC station 41117 returned no usable observation.");
  }
  if (tides.length) {
    const tideText = tides.map((event) => `${event.type} near ${displayLocalTime(event.time)} (${event.height_ft.toFixed(1)} ft)`).join("; ");
    lines.push(`• Tide: NOAA CO-OPS station 8720833 (Smith Creek, Flagler Beach; predictions above MLLW) — ${tideText}.`);
  } else {
    lines.push("• Tide: NOAA CO-OPS predictions for station 8720833 returned no high/low events for this date.");
  }
  const dateAlerts = activeAlertsForDate(alerts, targetDate);
  if (dateAlerts.length) {
    const summaries = dateAlerts.slice(0, 6).map((alert) => {
      const titleText = alert.headline || alert.event || "NWS alert";
      const severity = alert.severity && alert.severity !== "Unknown" ? ` (${alert.severity})` : "";
      return `${titleText}${severity}`;
    });
    lines.push(`• Hazards: active NWS alert(s) overlap this report date: ${summaries.join("; ")}. Review the full alert before going out.`);
  } else {
    lines.push("• Hazards: no current NWS alert in the returned feed overlaps this report date; this does not establish that surf or water conditions are safe.");
  }
  lines.push(`• Fishing score/rating: not generated from the official feeds. The official NWS, NDBC, and NOAA feeds have no fishing-rating field, so none is given here; see the conditions grade on this page for a simple weather-only heuristic.`);
  lines.push("• Sunrise/sunset: sunrise near " + displayLocalTime(sun.sunrise) + "; sunset near " + displayLocalTime(sun.sunset) + " (calculated for Flagler Beach coordinates).", "");

  const sunrise = sun.sunrise;
  const sunset = sun.sunset;
  const windowRanges = [
    { name: "Morning", start: sunrise, end: noaaLocalTimeToIso(targetDate, "11:00") },
    { name: "Afternoon", start: noaaLocalTimeToIso(targetDate, "12:00"), end: Date.parse(sunset) < Date.parse(noaaLocalTimeToIso(targetDate, "18:00")) ? sunset : noaaLocalTimeToIso(targetDate, "18:00") },
    { name: "Evening", start: noaaLocalTimeToIso(targetDate, "18:00"), end: sunset },
  ];
  lines.push("Best Fishing Windows");
  for (const window of windowRanges) {
    if (Date.parse(window.end) <= Date.parse(window.start)) continue;
    lines.push(`• ${window.name} (${displayLocalTime(window.start)}–${displayLocalTime(window.end)}): predicted tide timing: ${tideSummaryForWindow(tides, window.start, window.end)}. This is a daylight/tide window, not a verified bite forecast; rating unavailable.`);
  }
  lines.push("• Safety takes priority over tide timing. Use active alerts and observed surf conditions before choosing a location.", "");

  lines.push("Likely Fish & Approach");
  if (captain && captain.reports.length) {
    for (const item of captain.reports) {
      lines.push(`• Captain Experiences guide report (${item.location}; reported ${item.reported}): ${item.text}`);
    }
    lines.push("• These are recent regional guide reports, not confirmed same-day Flagler Beach surf catches or guaranteed species predictions.");
  } else {
    lines.push("• Captain Experiences guide reports were unavailable or could not be read at generation time; species and bait guidance are not current.");
  }
  lines.push("• Species likelihood and specific bait/location recommendations require local catch data and interpretation; use the quoted guide observations as regional context only.", "");

  lines.push("Sources");
  lines.push("• NWS Palm Coast grid forecast and active alerts for Flagler Beach.");
  lines.push("• NWS Jacksonville Coastal Waters Forecast zone AMZ454.");
  lines.push("• NWS KFIN observation (Flagler County Airport; not beach wind).");
  lines.push("• NOAA National Data Buoy Center station 41117 (offshore St. Augustine reference).");
  lines.push("• NOAA CO-OPS station 8720833 (Smith Creek, Flagler Beach; harmonic predictions; datum MLLW).");
  lines.push("• Sunrise/sunset calculated for Flagler Beach using the report date and coordinates.");
  lines.push("• Captain Experiences Flagler Beach regional guide reports.");
  const freshness = [];
  if (sourceAvailability.forecastUpdate) freshness.push(`NWS forecast updated ${sourceAvailability.forecastUpdate}`);
  if (sourceAvailability.observationAt) freshness.push(`KFIN observation ${sourceAvailability.observationAt}`);
  if (sourceAvailability.buoyObservedAt) freshness.push(`NDBC observation ${sourceAvailability.buoyObservedAt}`);
  if (sourceAvailability.tideFetchedAt) freshness.push(`NOAA tide predictions fetched ${sourceAvailability.tideFetchedAt}`);
  if (sourceAvailability.captainFetchedAt) freshness.push(`Captain Experiences page fetched ${sourceAvailability.captainFetchedAt}`);
  if (sourceAvailability.generatedAt) freshness.push(`Report generated ${sourceAvailability.generatedAt} UTC`);
  if (freshness.length) lines.push(`• Data freshness: ${freshness.join("; ")}.`);
  return lines.join("\n");
}

function validateStoredReport(report) {
  return Boolean(report && typeof report === "object"
    && report.schema_version === 1
    && /^\d{4}-\d{2}-\d{2}$/.test(report.report_date || "")
    && typeof report.run_id === "string" && report.run_id.trim()
    && typeof report.generated_at === "string" && Number.isFinite(Date.parse(report.generated_at))
    && typeof report.report_text === "string" && report.report_text.trim());
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function publicReport(report) {
  return {
    ok: true,
    report_date: report.report_date,
    generated_at: report.generated_at,
    report_text: report.report_text,
    checked_at: utcNow(),
  };
}

async function readReport(env, key) {
  const raw = await env.REPORTS.get(key);
  if (!raw) return null;
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    throw new UpstreamError("Stored report JSON is invalid.");
  }
  if (!validateStoredReport(report)) throw new UpstreamError("Stored report does not match schema version 1.");
  return report;
}

async function latestReport(env) {
  const [current, nextDay] = await Promise.all([
    readReport(env, REPORT_CURRENT_KEY),
    readReport(env, REPORT_NEXT_DAY_KEY),
  ]);
  const now = new Date();
  const today = localDate(now);
  const tomorrow = addCalendarDays(today, 1);
  const hour = formatLocalParts(now).hour;
  if (hour >= 19 && nextDay && nextDay.report_date === tomorrow) return nextDay;
  if (current && current.report_date === today) return current;
  // A prior evening's preview is a useful current-day fallback before the
  // morning report has completed.
  if (nextDay && nextDay.report_date === today) return nextDay;
  const candidates = [current, nextDay].filter(Boolean);
  candidates.sort((left, right) => {
    const dateCompare = left.report_date.localeCompare(right.report_date);
    return dateCompare || left.generated_at.localeCompare(right.generated_at);
  });
  return candidates.at(-1) || null;
}

async function liveData(key, loader) {
  const now = Date.now();
  const cached = liveCache.get(key);
  if (cached && cached.expiresAt > now) {
    const value = cached.promise ? await cached.promise : cached.value;
    return { ...value, cached: true };
  }
  const promise = loader().then((value) => {
    liveCache.set(key, { value, expiresAt: Date.now() + LIVE_CACHE_MS });
    return value;
  }).catch((error) => {
    liveCache.delete(key);
    throw error;
  });
  liveCache.set(key, { promise, expiresAt: now + LIVE_CACHE_MS });
  return { ...(await promise), cached: false };
}

async function handleApi(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method !== "GET") return jsonResponse(405, { ok: false, error: "method_not_allowed", message: "GET is required." });
  try {
    if (path === "/api/report") {
      const report = await latestReport(env);
      if (!report) return jsonResponse(503, { ok: false, error: "missing", message: "No report is stored yet. Seed the initial report or wait for a scheduled report run." });
      return jsonResponse(200, publicReport(report));
    }
    if (path === "/api/next-day-report") {
      const report = await readReport(env, REPORT_NEXT_DAY_KEY);
      if (!report) return jsonResponse(503, { ok: false, error: "missing", message: "No next-day report is stored yet." });
      return jsonResponse(200, publicReport(report));
    }
    if (path === "/api/live/weather") return jsonResponse(200, await liveData("weather", fetchWeatherLive));
    if (path === "/api/live/marine") {
      return jsonResponse(200, await liveData("marine", async () => {
        const { text, lastModified } = await fetchText(NDBC_URL, { accept: "text/plain" });
        return parseBuoy(text, lastModified);
      }));
    }
    if (path === "/api/live/tides") return jsonResponse(200, await liveData("tides", fetchTidesLive));
    return jsonResponse(404, { ok: false, error: "not_found", message: "API route not found." });
  } catch (error) {
    console.error("[api] request failed", path, error instanceof Error ? error.message : "unknown error");
    return jsonResponse(503, { ok: false, error: "unavailable", message: "The report or official data source is temporarily unavailable." });
  }
}

async function buildFishingReport(targetDate, preview, runId) {
  const [weather, observation, coastal, buoy, tidePredictions, alerts] = await Promise.all([
    fetchNwsForecast(),
    fetchWeatherObservation(),
    fetchCoastalForecast(targetDate),
    fetchBuoy(),
    fetchTidePredictions(addCalendarDays(targetDate, -1), addCalendarDays(targetDate, 1), "8720833"),
    fetchActiveAlerts(),
  ]);
  const weatherDetails = reportWeather(weather.periods, targetDate);
  if (!weatherDetails.matching.length) {
    throw new UpstreamError(`NWS forecast has no periods for ${targetDate}; stored report was not replaced.`);
  }
  if (!coastal.length) throw new UpstreamError(`NWS AMZ454 forecast has no periods for ${targetDate}; stored report was not replaced.`);
  const tideValues = tideEvents(tidePredictions).filter((event) => localDate(new Date(event.time)) === targetDate);
  if (!tideValues.length) throw new UpstreamError(`NOAA CO-OPS returned no high/low predictions for ${targetDate}; stored report was not replaced.`);
  if (![buoy.values.wave_height_m, buoy.values.wind_speed_ms, buoy.values.dominant_period_s].some((value) => value !== null)) {
    throw new UpstreamError("NDBC station 41117 returned no usable marine measurements; stored report was not replaced.");
  }
  let captain = null;
  try {
    captain = await fetchCaptainReports();
  } catch (error) {
    console.warn("[report] Captain Experiences guidance is unavailable; report will identify that gap", error instanceof Error ? error.message : "unknown error");
  }
  const generatedAt = utcNow();
  const sun = sunriseSunset(targetDate);
  const report = {
    schema_version: 1,
    forecast_grid: "JAX/89,29",
    report_date: targetDate,
    run_id: runId,
    generated_at: generatedAt,
    report_text: renderReport({
      targetDate,
      preview,
      weather,
      observation,
      coastal,
      buoy,
      tides: tideValues,
      alerts,
      captain,
      sun,
      sourceAvailability: {
        forecastUpdate: weather.properties.updateTime || null,
        observationAt: observation.observedAt,
        buoyObservedAt: buoy.observed_at,
        tideFetchedAt: generatedAt,
        captainFetchedAt: captain && captain.fetchedAt,
        generatedAt,
      },
    }),
  };
  if (!validateStoredReport(report)) throw new UpstreamError("Generated report failed schema validation.");
  return report;
}

function reportNeedsRetry(report) {
  return report.report_text.includes("Captain Experiences guide reports were unavailable or could not be read");
}

async function writeScheduledReport(env, kind, targetDate, mode) {
  const preview = kind === "next-day";
  const key = preview ? REPORT_NEXT_DAY_KEY : REPORT_CURRENT_KEY;
  const runId = `cloudflare-${kind}${mode === "recovery" ? "-recovery" : ""}-${targetDate}`;
  const existing = await readReport(env, key);
  if (existing && existing.report_date === targetDate && !reportNeedsRetry(existing)) {
    if (!(mode === "scheduled" && preview && existing.run_id === `cloudflare-next-day-recovery-${targetDate}`)) {
      console.log(`[schedule] idempotent ${kind} report already stored for ${targetDate} in ${key}; no duplicate write`);
      return;
    }
  }
  const report = await buildFishingReport(targetDate, preview, runId);
  await env.REPORTS.put(key, JSON.stringify(report));
  console.log(`[schedule] ${kind} report stored for ${targetDate} in ${key} (${mode})`);
}

async function runScheduledPipeline(env, kind, scheduledTime) {
  const reportDate = localDate(new Date(scheduledTime));
  const jobs = kind === "morning"
    ? [
      ["morning", reportDate, "scheduled"],
      ["next-day", addCalendarDays(reportDate, 1), "recovery"],
    ]
    : [
      ["next-day", addCalendarDays(reportDate, 1), "scheduled"],
      ["morning", reportDate, "recovery"],
    ];
  const failures = [];
  for (const [jobKind, targetDate, mode] of jobs) {
    try {
      await writeScheduledReport(env, jobKind, targetDate, mode);
    } catch (error) {
      failures.push(`${jobKind}: ${error instanceof Error ? error.message : "unknown error"}`);
      console.error(`[schedule] ${jobKind} ${mode} attempt failed for ${targetDate}; other due jobs will still be checked`, error);
    }
  }
  if (failures.length) throw new UpstreamError(failures.join("; "));
}

const CRON_MORNING = "0 10,11 * * *";
const CRON_NEXT_DAY = "0 0,23 * * *";

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
      console.log(`[schedule] skipped ${controller.cron} at ${localDate(new Date(controller.scheduledTime))} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")} ${TIME_ZONE}; not the target local hour`);
      return;
    }
    const kind = isMorning ? "morning" : "next-day";
    ctx.waitUntil(runScheduledPipeline(env, kind, controller.scheduledTime).catch((error) => {
      console.error(`[schedule] ${kind} report pipeline failed; last successfully stored KV report was preserved`, error instanceof Error ? error.message : "unknown error");
      throw error;
    }));
  },
};
