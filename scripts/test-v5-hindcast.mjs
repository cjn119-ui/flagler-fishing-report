import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";
import { SPECIES } from "../site/v5/species.js";
import { buildPredictionRun } from "../site/v5/engine/run.js";
import { validateNormalizedObservation } from "../site/v5/engine/contracts.js";
import {
  CACHE_DIR, DEFAULT_DATES, GO_THRESHOLDS, buildNormalizedObservations, candidateParams, evaluateFrequencyGates, loadCachedInputs, localInstant, mergeChunks, pct, renderReport, runHindcast, secondarySummaries,
} from "./hindcast/run-hindcast.mjs";

try { await access(resolve(CACHE_DIR, "kfin-hourly.json")); }
catch {
  console.log("SKIP V5 hindcast tests: .cache/hindcast is absent; run node scripts/hindcast/fetch-hindcast-data.mjs once to acquire the offline inputs.");
  process.exit(0);
}

const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); };
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

const cached = await loadCachedInputs();
const now = localInstant("2026-01-15", 6);
const params = candidateParams({ tideScale: 0.5, goThreshold: 55 });
const fullSpot = ACTIVE_SPOTS.find(spot => spot.id === "vilano-beach");
const miniSpot = { ...fullSpot, modes: ["surf"] };
const miniSpecies = SPECIES.filter(species => ["whiting", "pompano"].includes(species.id));
const observations = buildNormalizedObservations({ now, spot: miniSpot, datasets: cached, params });

await check("cached hindcast observations satisfy normalized source contracts and label perfect slots", () => {
  for (const input of observations) assert.equal(validateNormalizedObservation(input), true, input.kind);
  const futureKinds = ["hourlyForecast", "gridForecast", "waveForecast"];
  for (const input of observations.filter(item => futureKinds.includes(item.kind))) {
    assert.equal(input.inputBasis, "hindcast-perfect-observation");
    const rows = input.values.rows ?? Object.values(input.values).flat();
    for (const row of rows) {
      const from = Date.parse(row.startTime ?? row.validFrom ?? "");
      if (Number.isFinite(from)) assert.ok(from >= now, `${input.kind} includes an unlabelled pre-build slot`);
    }
  }
  const alerts = observations.find(item => item.kind === "alerts");
  assert.equal(alerts.assumption, "unverified/checked-none");
  assert.deepEqual(alerts.values.rows, []);
  const water = observations.find(item => item.kind === "waterTemperature");
  if (water.ok) assert.ok(Date.parse(water.observedAt) <= now);
});

await check("same frozen real-observation build produces byte-identical results twice", async () => {
  const build = () => buildPredictionRun({ now, locations: [miniSpot], species: miniSpecies, history: cached.history, observations,
    params, codeRevision: "a5-hindcast-determinism-test", catalogHash: "test-catalog" });
  const first = await build(), second = await build();
  assert.equal(canonical(first), canonical(second));
});

await check("mutating post-instant observations does not change a strict as-of build", async () => {
  const strictBase = buildNormalizedObservations({ now, spot: miniSpot, datasets: cached, params, allowPerfectObservationSlots: false });
  const changed = {
    ...cached,
    kfin: { ...cached.kfin, rows: cached.kfin.rows.map(row => Date.parse(row.reportTime ?? row.t) > now ? { ...row, windKt: 999, gustKt: 999, directionDeg: 180, precipitationIn: 99, altimeterInHg: 50, weatherCodes: "TS" } : row) },
    cdip: { ...cached.cdip, rows: cached.cdip.rows.map(row => Date.parse(row.t) > now ? { ...row, waveHeightM: 99, waterTempC: 99 } : row) },
  };
  const strictChanged = buildNormalizedObservations({ now, spot: miniSpot, datasets: changed, params, allowPerfectObservationSlots: false });
  assert.equal(canonical(strictBase), canonical(strictChanged));
  assert.ok(strictBase.find(item => item.kind === "pressureObservations").values.rows.every(row => Date.parse(row.at) <= now));
  const build = sourceRows => buildPredictionRun({ now, locations: [miniSpot], species: miniSpecies, history: cached.history, observations: sourceRows,
    params, codeRevision: "a5-hindcast-no-lookahead-test", catalogHash: "test-catalog" });
  assert.equal(canonical(await build(strictBase)), canonical(await build(strictChanged)));
});

await check("percentage arithmetic keeps a zero denominator unavailable", () => {
  assert.equal(pct(3, 10), 0.3);
  assert.equal(pct(0, 0), null);
});

await check("frequency gate evaluator passes exact boundaries and fails missing denominators", () => {
  const good = evaluateFrequencyGates({
    coverageRows: [{ month: "2026-01", locationId: "spot", mode: "surf", completeDays: 8, totalDays: 10 }],
    overall: { GO: 2, ungated: 10 },
    monthly: [{ month: "2026-01", GO: 7, ungated: 10 }],
    spotModes: [{ locationId: "spot", mode: "surf", GO: 3, ungated: 100 }],
  });
  assert.equal(good.pass, true);
  const zero = evaluateFrequencyGates({
    coverageRows: [{ month: "2026-01", locationId: "spot", mode: "surf", completeDays: 0, totalDays: 10 }],
    overall: { GO: 0, ungated: 0 }, monthly: [{ month: "2026-01", GO: 0, ungated: 0 }],
    spotModes: [{ locationId: "spot", mode: "surf", GO: 0, ungated: 0 }],
  });
  assert.equal(zero.pass, false);
  assert.equal(zero.overallShare, null);
  assert.equal(zero.sourceCoverageFailures.length, 1);
  assert.equal(zero.monthFailures.length, 1);
  assert.equal(zero.spotModeFailures.length, 1);
});

await check("secondary summaries keep morning tomorrow and evening horizons separate", () => {
  const horizon = verdict => ({ byThreshold: Object.fromEntries(GO_THRESHOLDS.map(threshold => [threshold, {
    best: { verdict, sourceComplete: true, safetyGated: false },
  }])) });
  const summary = secondarySummaries([
    { hour: 6, today: horizon("SKIP"), tomorrow: horizon("GO") },
    { hour: 19, today: horizon("MAYBE"), tomorrow: horizon("SKIP") },
  ]);
  for (const [label, verdict] of [["morningTomorrow", "GO"], ["eveningToday", "MAYBE"], ["eveningTomorrow", "SKIP"]]) {
    assert.equal(summary[label].rows, 1);
    for (const threshold of GO_THRESHOLDS) {
      const counts = summary[label].byThreshold[threshold];
      assert.equal(counts[verdict], 1);
      assert.equal(counts.ungated, 1);
      assert.equal(counts.selected, 1);
    }
  }
  const empty = secondarySummaries([]);
  assert.equal(empty.eveningToday.rows, 0);
  assert.equal(empty.eveningToday.byThreshold[70].goShare, null);
});

await check("six-date primary-only chunk merge matches one-pass summary byte for byte", async () => {
  const dates = DEFAULT_DATES.filter(day => day >= "2026-03-01" && day <= "2026-03-06");
  assert.equal(dates.length, 6);
  const outputDir = await mkdtemp(resolve(tmpdir(), "v5-hindcast-chunks-"));
  try {
    await runHindcast({ dates, primaryOnly: true, outputDir, reportPath: null });
    const onePass = await readFile(resolve(outputDir, "summary-primary.json"), "utf8");
    for (let index = 1; index <= 3; index++) await runHindcast({ dates, primaryOnly: true, chunk: { index, count: 3 }, outputDir, reportPath: null });
    const chunk = JSON.parse(await readFile(resolve(outputDir, "chunk-primary-1-of-3.json"), "utf8"));
    assert.equal(chunk.dates.length, 2);
    assert.ok(chunk.denominators.length > 0);
    for (const row of chunk.denominators) {
      assert.equal(row.totalDays, 2);
      assert.equal(row.completeDays + (row.totalDays - row.completeDays), row.totalDays);
      assert.ok(row.candidateDays <= row.totalDays);
    }
    const reportPath = resolve(outputDir, "summary-report.md");
    await mergeChunks({ dates, mode: "primary", outputDir, expectedManifestSha256: cached.manifestSha256, reportPath });
    const merged = await readFile(resolve(outputDir, "summary-primary.json"), "utf8");
    assert.equal(merged, onePass);
    assert.equal(await readFile(reportPath, "utf8"), renderReport(JSON.parse(merged)));
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

console.log("\n7 passed, 0 failed");
