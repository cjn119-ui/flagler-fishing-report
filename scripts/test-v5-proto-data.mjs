import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detailsRefFor, factorsAt, fetchProtoRun, fetchRunDetails, loadProtoData, readCachedProtoRuns, trimForCache, writeCachedProtoRun } from "../site/v5/proto/proto-data.js";

const sampleToday = JSON.parse(await readFile(new URL("../site/v5/proto/sample-rich.json", import.meta.url), "utf8"));
const sampleTomorrow = JSON.parse(await readFile(new URL("../site/v5/proto/sample-rich-tomorrow.json", import.meta.url), "utf8"));
const liveToday = structuredClone(sampleToday); liveToday.codeRevision = "recorded-live-shape"; liveToday.detailsRefs ??= [];
const liveTomorrow = structuredClone(sampleTomorrow); liveTomorrow.codeRevision = "recorded-live-shape"; liveTomorrow.detailsRefs ??= [];
const storage = new Map();
const storageStub = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const called = [];
const response = value => ({ ok: true, json: async () => value });

const live = await loadProtoData({ storage: storageStub, online: true, fetchImpl: async path => {
  called.push(path);
  return response(path.endsWith("today.json") ? liveToday : liveTomorrow);
} });
assert.equal(live.source, "live");
assert.equal(live.today.codeRevision, "recorded-live-shape");
assert.deepEqual(called, ["../../api/v5/today.json", "../../api/v5/tomorrow.json"]);
assert.ok(JSON.stringify(JSON.parse(storageStub.getItem("v5proto.live.today"))).length < 1_500_000, "trimmed offline cache stays under 1.5 MB per run");
assert.ok(JSON.stringify(trimForCache(liveToday)).length < 1_500_000, "cached run remains renderable under the per-run budget");
const independentStorage = new Map();
const independentStub = { getItem: key => independentStorage.get(key) ?? null, setItem: (key, value) => independentStorage.set(key, value) };
assert.equal(writeCachedProtoRun(independentStub, "today", liveToday), true);
assert.equal(readCachedProtoRuns(independentStub), null, "startup cache requires a valid pair");
assert.equal(writeCachedProtoRun(independentStub, "tomorrow", liveTomorrow), true);
assert.deepEqual(readCachedProtoRuns(independentStub), { today: trimForCache(liveToday), tomorrow: trimForCache(liveTomorrow) });
const todayFetch = await fetchProtoRun("today", { fetchImpl: async path => {
  assert.equal(path, "../../api/v5/today.json");
  return { ok: true, text: async () => JSON.stringify(liveToday), headers: { get: () => null } };
} });
assert.equal(todayFetch.run.id, liveToday.id, "single-horizon refresh parses and validates today independently");
const badHorizon = writeCachedProtoRun(independentStub, "yesterday", liveToday);
assert.equal(badHorizon, false, "unknown horizons cannot overwrite either cache slot");

const bridged = await loadProtoData({ storage: null, online: true, fetchImpl: async path => ({ ok: true, json: async () => path.endsWith("today.json") ? liveToday : liveTomorrow, headers: { get: name => name === "x-flagler-ios-cache" ? "stale" : null } }) });
assert.equal(bridged.source, "cached", "iOS bridge cache header is reflected honestly");
assert.equal(bridged.offline, false, "a cached bridge response may still be served while online");

const cached = await loadProtoData({ storage: storageStub, online: false, fetchImpl: async () => { throw new Error("should not fetch while offline"); } });
assert.equal(cached.source, "cached");
assert.equal(cached.offline, true);
assert.equal(cached.today.codeRevision, "recorded-live-shape");

const sample = await loadProtoData({ storage: null, online: true, fetchImpl: async path => {
  if (path.includes("api/v5")) return { ok: false, status: 404 };
  return response(path === "sample-rich.json" ? sampleToday : sampleTomorrow);
} });
assert.equal(sample.source, "sample");
assert.equal(sample.today.id, sampleToday.id);
{ // live details files supply per-slot factors
  const run = { detailsRefs: ["details/r1/flagler-icw-inshore.json", "details/r1/flagler-pier-pier.json"] };
  assert.equal(detailsRefFor(run, "flagler-icw", "inshore"), "details/r1/flagler-icw-inshore.json");
  assert.equal(detailsRefFor(run, "flagler-icw", "surf"), null);
  const details = { rows: [{ speciesId: "mangrove", slots: [
    { at: "2026-10-14T20:30:00.000Z", factors: [{ key: "wind", effect: "helps" }] },
    { at: "2026-10-14T21:00:00.000Z", factors: [{ key: "wind", effect: "hurts" }] }] }] };
  assert.equal(factorsAt(details, "mangrove", "2026-10-14T20:40:00Z")[0].effect, "helps");
  assert.equal(factorsAt(details, "mangrove", "2026-10-14T20:55:00Z")[0].effect, "hurts");
  assert.deepEqual(factorsAt(details, "whiting", "2026-10-14T20:40:00Z"), []);
  let calls = 0;
  const fetchImpl = async (url) => { calls++; assert.equal(url, "../../api/v5/details/r1/flagler-icw-inshore.json"); return { ok: true, json: async () => details }; };
  assert.equal((await fetchRunDetails(run, "flagler-icw", "inshore", { fetchImpl })).rows.length, 1);
  await fetchRunDetails(run, "flagler-icw", "inshore", { fetchImpl });
  assert.equal(calls, 1, "details are fetched once per file");
  assert.equal(await fetchRunDetails(run, "nowhere", "inshore", { fetchImpl }), null);
}
console.log("RESULT live-first, offline-cache, and sample-fallback checks passed");
