import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadProtoData } from "../site/v5/proto/proto-data.js";

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
