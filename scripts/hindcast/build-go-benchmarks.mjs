#!/usr/bin/env node
// Build frozen seasonal GO baselines from the cached primary hindcast chunks.
// This script is deterministic, offline, and does not replay model builds.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ACTIVE_SPOTS } from "../../site/v5/spots.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_CHUNK_DIR = path.join(ROOT, ".cache/hindcast-out");
export const DEFAULT_OUTPUT = path.join(DEFAULT_CHUNK_DIR, "go-seasonal-benchmarks.json");
const WINDOW_DAYS = 15, MIN_SAMPLES = 10;
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`
    : JSON.stringify(value);
const calendar = Array.from({ length: 366 }, (_, i) => {
  const date = new Date(Date.UTC(2024, 0, i + 1));
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
});
const calendarIndex = new Map(calendar.map((key, i) => [key, i]));
const distance = (a, b) => Math.min(Math.abs(a - b), 366 - Math.abs(a - b));
const median = values => { const xs = [...values].sort((a, b) => a - b), i = Math.floor(xs.length / 2); return xs.length % 2 ? xs[i] : (xs[i - 1] + xs[i]) / 2; };

export async function buildGoBenchmarks({ chunkDir = DEFAULT_CHUNK_DIR } = {}) {
  const names = (await readdir(chunkDir)).filter(name => /^chunk-primary-\d+-of-8\.json$/.test(name)).sort();
  if (names.length !== 8) throw new Error(`Expected all 8 primary hindcast chunks; found ${names.length}.`);
  const chunks = await Promise.all(names.map(async name => JSON.parse(await readFile(path.join(chunkDir, name), "utf8"))));
  const sourceManifestSha256 = chunks[0]?.manifestSha256;
  if (!/^[a-f0-9]{64}$/.test(sourceManifestSha256 ?? "") || chunks.some((c, i) => c.mode !== "primary" || c.chunk?.index !== i + 1 || c.chunk?.count !== 8 || c.manifestSha256 !== sourceManifestSha256)) throw new Error("Primary chunks must be complete, ordered, and share one source manifest hash.");
  const samples = new Map(ACTIVE_SPOTS.filter(s => s.active !== false).flatMap(s => s.modes.map(mode => [`${s.id}:${mode}`, new Map()])));
  for (const record of chunks.flatMap(c => c.records).filter(r => r.hour === 6 && r.tideScale === 0.5)) {
    const day = calendarIndex.get(record.day?.slice(5));
    if (day === undefined) throw new Error(`Invalid primary build date: ${record.day}`);
    const byLocation = record.today?.byThreshold?.["70"]?.byLocation;
    if (!byLocation) throw new Error(`Primary build ${record.day} lacks today.byThreshold[70].byLocation.`);
    for (const [cell, row] of Object.entries(byLocation)) {
      const series = samples.get(cell);
      if (!series || !row || row.safetyGated || !row.sourceComplete || !Number.isFinite(row.suitability)) continue;
      const key = record.day.slice(5);
      if (series.has(key)) throw new Error(`Duplicate daily-best suitability for ${cell} at ${record.day}.`);
      series.set(key, { day, suitability: row.suitability });
    }
  }
  const goSeasonal = {}, sampleCounts = {}, nullReasons = {};
  for (const [cell, series] of samples) {
    goSeasonal[cell] = {}; sampleCounts[cell] = {}; nullReasons[cell] = {};
    for (const dayKey of calendar) {
      const center = calendarIndex.get(dayKey), values = [...series.values()].filter(x => distance(x.day, center) <= WINDOW_DAYS).map(x => x.suitability);
      sampleCounts[cell][dayKey] = values.length;
      if (values.length < MIN_SAMPLES) {
        goSeasonal[cell][dayKey] = null;
        nullReasons[cell][dayKey] = "no eligible candidates in this window";
      } else goSeasonal[cell][dayKey] = median(values);
    }
  }
  return { sourceManifestSha256, windowDays: WINDOW_DAYS, minimumSamples: MIN_SAMPLES, goSeasonal, sampleCounts, nullReasons };
}

export async function writeGoBenchmarks({ chunkDir = DEFAULT_CHUNK_DIR, outputPath = DEFAULT_OUTPUT, updateParams = false } = {}) {
  const table = await buildGoBenchmarks({ chunkDir });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${stable(table)}\n`);
  if (updateParams) {
    const paramsPath = path.join(ROOT, "site/v5/engine/params.js"), source = await readFile(paramsPath, "utf8");
    const start = "// BEGIN GENERATED GO BENCHMARK DATA", end = "// END GENERATED GO BENCHMARK DATA";
    const a = source.indexOf(start), b = source.indexOf(end);
    if (a < 0 || b < a) throw new Error("params.js is missing generated benchmark insertion markers.");
    const replacement = `${start}\nconst GO_BENCHMARK_DATA = deepFreeze(${JSON.stringify(table, null, 2)});\n${end}`;
    await writeFile(paramsPath, `${source.slice(0, a)}${replacement}${source.slice(b + end.length)}`);
  }
  const nullWindows = Object.fromEntries(Object.entries(table.goSeasonal).map(([cell, days]) => [cell, Object.values(days).filter(value => value === null).length]));
  return { table, outputPath, nullWindows };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await writeGoBenchmarks({ updateParams: process.argv.includes("--update-params") });
  console.log(JSON.stringify({ output: result.outputPath, sourceManifestSha256: result.table.sourceManifestSha256, cells: Object.keys(result.table.goSeasonal).length, nullWindows: result.nullWindows }, null, 2));
}
