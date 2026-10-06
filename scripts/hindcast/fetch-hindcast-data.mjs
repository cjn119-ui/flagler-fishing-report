#!/usr/bin/env node
// Read-only, resume-safe historical observation downloader for the V5 hindcast.
// Raw HTTP responses are cached by URL SHA-256; normalized products are reproducible.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_SPOTS } from '../../site/v5/spots.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, '.cache/hindcast');
const RAW = path.join(OUT, 'raw');
const START = '2025-10-01T00:00:00Z';
const END = '2026-10-01T00:00:00Z'; // exclusive; window ends 2026-09-30 UTC
const USER_AGENT = 'FlaglerFishingReport-Hindcast/1.0 (read-only research; contact: project maintainers)';
const DRY = process.argv.includes('--dry-run');
const timestamp = (s) => Date.parse(s);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const compact = (x) => `${JSON.stringify(x)}\n`;
const safe = (s) => s.replace(/[^a-zA-Z0-9._-]/g, '_');
const requests = [];

function addRequest(key, url, parser, output, description) {
  requests.push({ key, url, parser, output, description });
}

const fields = ['sknt', 'gust', 'drct', 'p01i', 'alti', 'mslp', 'wxcodes'];
const iem = new URL('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py');
for (const [k, v] of Object.entries({ station: 'KFIN', year1: '2025', month1: '10', day1: '1', year2: '2026', month2: '10', day2: '1', tz: 'Etc/UTC', format: 'comma', latlon: 'no', elev: 'no', missing: 'empty', trace: 'T', direct: 'no' })) iem.searchParams.set(k, v);
for (const f of fields) iem.searchParams.append('data', f);
iem.searchParams.append('report_type', '1');
iem.searchParams.append('report_type', '2');
addRequest('kfin-asos', iem.href, 'iem', 'kfin-hourly.json', 'KFIN ASOS observations');

const stations = [...new Set(ACTIVE_SPOTS.map((s) => s.tide))].sort();
for (const station of stations) {
  const u = new URL('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter');
  for (const [k, v] of Object.entries({ begin_date: '20251001', end_date: '20260930', station, product: 'predictions', datum: 'MLLW', time_zone: 'gmt', units: 'english', interval: 'hilo', format: 'json', application: 'FlaglerFishingReportHindcast' })) u.searchParams.set(k, v);
  addRequest(`coops-hilo-${station}`, u.href, 'coops', `tides-${station}.json`, `CO-OPS predictions ${station}`);
  const meta = `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${station}/products.json?units=english&format=json`;
  addRequest(`coops-products-${station}`, meta, 'products', null, `CO-OPS available products ${station}`);
}

// CDIP/SECOORA historical tabledap. Filter to the requested UTC window and request
// observation and QARTOD aggregate fields; ERDDAP reports the native units in row 2.
const vars = ['time', 'sea_surface_wave_significant_height', 'sea_surface_wave_mean_period', 'sea_surface_wave_period_at_variance_spectral_density_maximum', 'sea_surface_wave_from_direction', 'sea_water_temperature', 'sea_surface_wave_significant_height_qc_agg', 'sea_water_temperature_qc_agg'];
const cdipUrl = `https://erddap.secoora.org/erddap/tabledap/edu_ucsd_cdip_194.csv?${vars.join(',')}&time%3E=${encodeURIComponent(START)}&time%3C=${encodeURIComponent(END)}&orderBy(%22time%22)`;
addRequest('cdip-194', cdipUrl, 'cdip', 'cdip-194.json', 'CDIP 194 waves and temperature');

function csvRows(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const row = []; let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) { row.push(cur); cur = ''; }
      else cur += c;
    }
    row.push(cur); return row;
  });
}
const num = (v) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) || n === -9999 ? null : n; };

function parseIem(text) {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.startsWith('station,valid'));
  if (headerAt < 0) throw Error(`IEM CSV header missing; response begins: ${text.slice(0, 180)}`);
  const rows = csvRows(lines.slice(headerAt).join('\n'));
  const heads = rows.shift();
  const out = new Map();
  for (const cells of rows) {
    const r = Object.fromEntries(heads.map((h, i) => [h, cells[i] ?? '']));
    const t = Date.parse(`${r.valid}Z`); if (!Number.isFinite(t) || t < timestamp(START) || t >= timestamp(END)) continue;
    // ASOS reports are irregular. Retain the last valid report within each UTC hour.
    const hour = Math.floor(t / 3600000) * 3600000;
    out.set(hour, { t: new Date(hour).toISOString(), windKt: num(r.sknt), gustKt: num(r.gust), directionDeg: num(r.drct), precipitationIn: num(r.p01i), altimeterInHg: num(r.alti), seaLevelPressureInHg: num(r.mslp), weatherCodes: r.wxcodes || null, reportTime: new Date(t).toISOString() });
  }
  return { rows: [...out.values()].sort((a, b) => a.t.localeCompare(b.t)), units: { windKt: 'knot', gustKt: 'knot', directionDeg: 'degree_from_north', precipitationIn: 'inch', altimeterInHg: 'inHg', seaLevelPressureInHg: 'inHg' } };
}

function parseCoops(text) {
  const x = JSON.parse(text); if (x.error) throw Error(JSON.stringify(x.error));
  const rows = (x.predictions ?? []).map((r) => ({ t: new Date(`${r.t.replace(' ', 'T')}:00Z`).toISOString(), heightFt: num(r.v), type: r.type, flags: r.f ?? null })).filter((r) => Number.isFinite(Date.parse(r.t)));
  return { rows, units: { heightFt: 'foot relative to MLLW', time: 'UTC' } };
}

function parseProducts(text) {
  const x = JSON.parse(text);
  return { products: (x.products ?? []).map((p) => p.name), raw: x.products ?? [] };
}

function parseCdip(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0].startsWith('time,')) throw Error(`ERDDAP CSV response invalid: ${text.slice(0, 150)}`);
  const hdr = csvRows(lines[0])[0];
  const units = csvRows(lines[1])[0];
  const rows = [];
  for (const cells of csvRows(lines.slice(2).join('\n'))) {
    const r = Object.fromEntries(hdr.map((h, i) => [h, cells[i] ?? '']));
    const t = Date.parse(r.time); if (!Number.isFinite(t)) continue;
    rows.push({ t: new Date(t).toISOString(), waveHeightM: num(r.sea_surface_wave_significant_height), meanPeriodS: num(r.sea_surface_wave_mean_period), peakPeriodS: num(r.sea_surface_wave_period_at_variance_spectral_density_maximum), waveDirectionDeg: num(r.sea_surface_wave_from_direction), waterTempC: num(r.sea_water_temperature), waveQc: num(r.sea_surface_wave_significant_height_qc_agg), waterTempQc: num(r.sea_water_temperature_qc_agg) });
  }
  return { rows, units: Object.fromEntries(hdr.map((h, i) => [h, units[i]]).filter(([h]) => h !== 'time')) };
}

const parsers = { iem: parseIem, coops: parseCoops, products: parseProducts, cdip: parseCdip };
const waits = new Map();
async function exists(p) { try { await access(p); return true; } catch { return false; } }
async function getBody(req) {
  const rawPath = path.join(RAW, `${safe(req.key)}-${sha256(req.url)}.txt`);
  if (await exists(rawPath)) return { body: await readFile(rawPath, 'utf8'), cached: true, fetchedAt: new Date((await stat(rawPath)).mtimeMs).toISOString() };
  const host = new URL(req.url).host;
  const prior = waits.get(host) ?? 0;
  const delay = Math.max(0, prior + 1000 - Date.now());
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  const res = await fetch(req.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv,application/json,*/*' } });
  waits.set(host, Date.now());
  if (!res.ok) throw Error(`${req.key}: HTTP ${res.status} ${res.statusText}`);
  const body = await res.text();
  await writeFile(rawPath, body);
  return { body, cached: false, fetchedAt: new Date((await stat(rawPath)).mtimeMs).toISOString() };
}

function coverage(rows) {
  const months = {};
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(2025, 9 + m, 1));
    const key = d.toISOString().slice(0, 7);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const total = (next - d) / 3600000;
    const hours = new Set(rows.map((r) => Math.floor(Date.parse(r.t) / 3600000)).filter((h) => h * 3600000 >= +d && h * 3600000 < +next));
    months[key] = { hoursWithData: hours.size, totalHours: total, coveragePct: Number((100 * hours.size / total).toFixed(2)) };
  }
  const times = [...new Set(rows.map((r) => Date.parse(r.t)).filter(Number.isFinite))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > 3 * 3600000) gaps.push({ from: new Date(times[i - 1]).toISOString(), to: new Date(times[i]).toISOString(), hours: Number(((times[i] - times[i - 1]) / 3600000).toFixed(2)) });
  return { months, gapsOver3h: gaps };
}

if (DRY) {
  for (const req of requests) {
    const rawPath = path.join(RAW, `${safe(req.key)}-${sha256(req.url)}.txt`);
    console.log(`${await exists(rawPath) ? 'CACHED' : 'GET'}\t${req.key}\t${req.url}`);
  }
  process.exit(0);
}

await mkdir(RAW, { recursive: true });
const details = [];
const productsByStation = {};
const productRequests = [];
for (const req of requests) {
  const { body, cached, fetchedAt } = await getBody(req);
  if (req.parser === 'products') {
    const station = req.key.split('-').at(-1);
    productsByStation[station] = parsers.products(body);
    productRequests.push({ key: req.key, url: req.url, cached });
    continue;
  }
  const parsed = parsers[req.parser](body);
  const serial = compact(parsed);
  const file = path.join(OUT, req.output);
  await writeFile(file, serial);
  const rows = parsed.rows ?? [];
  const columns = req.parser === 'iem'
    ? ['windKt', 'gustKt', 'directionDeg', 'precipitationIn', 'altimeterInHg', 'seaLevelPressureInHg', 'weatherCodes']
    : req.parser === 'cdip'
      ? ['waveHeightM', 'meanPeriodS', 'peakPeriodS', 'waveDirectionDeg', 'waterTempC']
      : req.parser === 'coops' ? ['heightFt'] : [];
  const fieldCoverage = Object.fromEntries(columns.map((field) => [field, coverage(rows.filter((r) => r[field] !== null && r[field] !== undefined))]));
  details.push({ key: req.key, urlPattern: req.url, url: req.url, fetchedAt, cached, output: req.output, rowCount: rows.length, sha256: sha256(serial), bytes: Buffer.byteLength(serial), firstTimestamp: rows[0]?.t ?? null, lastTimestamp: rows.at(-1)?.t ?? null, units: parsed.units, fieldCoverage, ...coverage(rows) });
}

// Identify products offered at each active tide station. Request optional station
// products only when the metadata advertises them, in short monthly chunks.
const optionalDetails = [];
for (const station of stations) {
  const offered = productsByStation[station]?.products ?? [];
  const hasWaterTemp = offered.some((p) => p.toLowerCase().includes('water temperature'));
  const hasMet = offered.some((p) => p.toLowerCase().includes('meteorological'));
  const optionalProducts = [
    { product: 'water_temperature', units: 'metric', offered: hasWaterTemp || hasMet, reason: 'water temperature sensor (if listed directly or under Meteorological)' },
    ...['air_temperature', 'wind', 'air_pressure', 'humidity', 'visibility'].map((product) => ({ product, units: 'english', offered: hasMet, reason: 'Meteorological product category' })),
  ];
  for (const { product, units, offered: found, reason } of optionalProducts) {
    if (!found) { optionalDetails.push({ station, product, offered: false, rowCount: 0, limitation: `Not listed in CO-OPS products metadata (${reason}).` }); continue; }
    const all = [];
    // CO-OPS observed-product date limits vary; monthly requests are conservative.
    for (let m = 0; m < 12; m++) {
      const a = new Date(Date.UTC(2025, 9 + m, 1));
      const b = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
      const u = new URL('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter');
      for (const [k, v] of Object.entries({ begin_date: a.toISOString().slice(0, 10).replaceAll('-', ''), end_date: b.toISOString().slice(0, 10).replaceAll('-', ''), station, product, time_zone: 'gmt', units, format: 'json', application: 'FlaglerFishingReportHindcast' })) u.searchParams.set(k, v);
      const req = { key: `coops-${product}-${station}-${a.toISOString().slice(0, 7)}`, url: u.href };
      const { body, cached } = await getBody(req); let data;
      try { data = JSON.parse(body); } catch { data = {}; }
      if (data.error) { optionalDetails.push({ station, product, month: a.toISOString().slice(0, 7), offered: true, rowCount: 0, error: data.error.message ?? JSON.stringify(data.error), cached }); continue; }
      const arr = data.data ?? [];
      for (const r of arr) all.push({ t: new Date(`${r.t.replace(' ', 'T')}:00Z`).toISOString(), value: num(r.v), flags: r.f ?? null });
    }
    const serial = compact({ station, product, rows: all, units: product === 'water_temperature' ? { value: 'degree_Celsius' } : { value: 'CO-OPS API english units; see original response/cache for field-specific meaning' } });
    const output = `coops-${product}-${station}.json`;
    await writeFile(path.join(OUT, output), serial);
    optionalDetails.push({ station, product, offered: true, output, rowCount: all.length, sha256: sha256(serial), firstTimestamp: all[0]?.t ?? null, lastTimestamp: all.at(-1)?.t ?? null, ...coverage(all.map((r) => ({ t: r.t }))) });
  }
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  window: { start: START, endExclusive: END, description: '12 months ending 2026-09-30 UTC' },
  acquisition: { readOnly: true, userAgent: USER_AGENT, cacheDirectory: '.cache/hindcast/raw', cachePolicy: 'Raw response keyed by request URL SHA-256; cached responses are reused on rerun.', assumedAlertState: 'checked/none (scenario assumption; historical alert snapshots not recovered)', weatherProxy: 'Observed KFIN precipitation is used as a perfect-observation rain proxy; not an archived NWS probability-of-precipitation forecast.', basis: 'hindcast-perfect-observation' },
  sources: details,
  stationProducts: Object.fromEntries(stations.map((station) => [station, productsByStation[station]?.products ?? []])),
  optionalCoopsProducts: optionalDetails,
  stationCoverage: { activeSpotCount: ACTIVE_SPOTS.length, activeTideStations: stations, activeSpotTideMap: ACTIVE_SPOTS.map(({ id, tide }) => ({ spotId: id, tideStation: tide })), tideStationsFullYearHilo: details.filter((s) => s.key.startsWith('coops-hilo-')).map((s) => ({ station: s.key.split('-').at(-1), firstDate: s.firstTimestamp?.slice(0, 10) ?? null, lastDate: s.lastTimestamp?.slice(0, 10) ?? null, fullWindowHasRows: !!s.rowCount && s.firstTimestamp?.slice(0, 10) <= START.slice(0, 10) && s.lastTimestamp?.slice(0, 10) >= '2026-09-30' })) },
  limitations: [
    'Past NWS forecast issuances and historical alert snapshots are not reproduced. Observed wind, precipitation and pressure stand in as perfect-forecast inputs; this is not forecast-skill evidence.',
    'CO-OPS hilo rows are harmonic predictions calculated for the dates, not archived prediction issuances or observed water levels.',
    'CO-OPS hilo has roughly four extrema per day; reported >3-hour intervals between these sparse events are sampling intervals, not automatically missing-data incidents.',
    'CDIP 194 / NDBC 41117 provides offshore buoy conditions and does not represent every active spot, especially protected inshore locations; join is by UTC timestamp, with no spatial correction.',
    'Hourly KFIN ASOS values are last report in each UTC hour, not necessarily a report at the top of the hour; missing hours remain missing.',
    'IEM p01i is one-hour precipitation for the interval since the station precipitation reset; reset timing varies slightly by site.',
    'Observed precipitation is a binary/perfect-observation rain proxy where downstream replay interprets occurrence; it is not PoP. Weather codes are present-weather observations, not forecast thunder.',
    'CO-OPS water temperature and meteorological products are fetched only when station metadata advertises availability; unoffered products remain unavailable.'
  ],
  requestLog: details.map(({ key, cached }) => ({ key, reusedCachedResponse: cached })).concat(productRequests.map(({ key, cached }) => ({ key, reusedCachedResponse: cached })), optionalDetails.filter((x) => x.month).map(({ station, product, month }) => ({ key: `coops-${product}-${station}-${month}` })))
};
await writeFile(path.join(ROOT, 'scripts/hindcast/MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: '.cache/hindcast', sourceCount: details.length, optionalProductStations: optionalDetails.length, rows: Object.fromEntries(details.map((s) => [s.key, s.rowCount])) }, null, 2));
