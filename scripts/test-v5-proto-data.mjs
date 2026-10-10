import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadProtoData, trimForCache } from "../site/v5/proto/proto-data.js";

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
console.log("RESULT live-first, offline-cache, and sample-fallback checks passed");
