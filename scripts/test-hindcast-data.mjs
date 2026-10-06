#!/usr/bin/env node
// Offline structural/integrity check for the downloaded hindcast source bundle.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.cache/hindcast');
const manifestPath = path.join(root, 'scripts/hindcast/MANIFEST.json');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const skip = (message) => { console.log(`SKIP: ${message}`); process.exit(0); };
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { skip('hindcast manifest is absent; fetch data first.'); }
try { await readFile(path.join(cache, 'kfin-hourly.json')); } catch { skip('.cache/hindcast is absent or incomplete; run scripts/hindcast/fetch-hindcast-data.mjs first.'); }

function assert(ok, message) { if (!ok) throw new Error(message); }
assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
assert(manifest.window?.start === '2025-10-01T00:00:00Z' && manifest.window?.endExclusive === '2026-10-01T00:00:00Z', 'window does not match required UTC interval');
assert(Array.isArray(manifest.sources) && manifest.sources.length >= 3, 'sources must include KFIN, CDIP and CO-OPS');
assert(manifest.acquisition?.basis === 'hindcast-perfect-observation', 'perfect-observation basis label missing');
assert(manifest.acquisition?.assumedAlertState, 'assumed alert state missing');
for (const source of manifest.sources) {
  assert(typeof source.url === 'string' && source.urlPattern === source.url && typeof source.output === 'string', `${source.key}: URL pattern/output required`);
  assert(Number.isFinite(Date.parse(source.fetchedAt)), `${source.key}: fetchedAt required`);
  assert(Number.isInteger(source.rowCount) && source.rowCount >= 0, `${source.key}: invalid rowCount`);
  assert(typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256), `${source.key}: invalid hash`);
  assert(source.months && Object.keys(source.months).length === 12, `${source.key}: expected 12 monthly coverage records`);
  assert(source.fieldCoverage && Object.keys(source.fieldCoverage).length > 0, `${source.key}: field-level coverage missing`);
  assert(Array.isArray(source.gapsOver3h), `${source.key}: missing gap list`);
  const body = await readFile(path.join(cache, source.output));
  assert(sha256(body) === source.sha256, `${source.key}: normalized file SHA-256 mismatch`);
  const parsed = JSON.parse(body);
  assert(Array.isArray(parsed.rows) && parsed.rows.length === source.rowCount, `${source.key}: normalized row count mismatch`);
}
assert(manifest.stationCoverage?.activeSpotCount > 0, 'active spot count missing');
assert(manifest.stationCoverage.activeSpotTideMap.length === manifest.stationCoverage.activeSpotCount, 'active spot tide mapping incomplete');
assert(manifest.stationCoverage.tideStationsFullYearHilo.every((s) => s.fullWindowHasRows), 'one or more active tide stations lack full-year hilo bounds');
assert(manifest.limitations.some((x) => /not forecast-skill/i.test(x)), 'forecast limitation missing');
console.log(`PASS: ${manifest.sources.length} source files match recorded row counts and SHA-256; ${manifest.stationCoverage.activeSpotCount} active spots map to full-year tide stations.`);
