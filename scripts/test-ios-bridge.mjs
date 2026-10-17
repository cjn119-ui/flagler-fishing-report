import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCachedFetch, nativeBackgroundColor, rewriteApiUrl } from "../ios/bridge.js";

const bundleSource = await readFile(new URL("./build-ios-web.mjs", import.meta.url), "utf8");
for (const excluded of ["v5/proto/shots/", "v5/proto/NOTES.md", "v5/proto/img/hero-licensed.jpg", "v5/proto/img/fish/ref/"]) assert.ok(bundleSource.includes(excluded), `native bundle excludes ${excluded}`);

const base = "capacitor://localhost/index.html";
const pagesBase = "https://cjn119-ui.github.io/flagler-fishing-report/";
assert.equal(rewriteApiUrl("api/live/marine.json?check=1", { base, pagesBase }), `${pagesBase}api/live/marine.json?check=1`);
assert.equal(rewriteApiUrl("../../api/v5/today.json", { base: "capacitor://localhost/v5/proto/", pagesBase }), `${pagesBase}api/v5/today.json`);
assert.equal(rewriteApiUrl("https://api.weather.gov/gridpoints/JAX/89,29/forecast", { base, pagesBase }), "https://api.weather.gov/gridpoints/JAX/89,29/forecast");
assert.equal(rewriteApiUrl("https://cjn119-ui.github.io/flagler-fishing-report/api/live/marine.json", { base, pagesBase }), "https://cjn119-ui.github.io/flagler-fishing-report/api/live/marine.json");
assert.equal(nativeBackgroundColor({ theme: "light", background: "#F3F6F9" }), "#F3F6F9");
assert.equal(nativeBackgroundColor({ theme: "dark", night: "1", background: "#000000" }), "#000000");
assert.equal(nativeBackgroundColor({ theme: "dark" }), "#0B1117");

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const body = { ok: true, observed_at: "2026-10-10T12:00:00Z" };
let time = 1_800_000_000_000;
let staleAt = null;
let fail = false;
const fetcher = createCachedFetch({
  base,
  pagesBase,
  storage,
  now: () => time,
  onStale: (at) => { staleAt = at; },
  fetchImpl: async (url) => {
    if (fail) throw new TypeError("offline");
    assert.equal(new URL(String(url)).pathname, "/flagler-fishing-report/api/live/marine.json");
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  },
});
const fresh = await fetcher("api/live/marine.json?check=1");
assert.deepEqual(await fresh.json(), body);
fail = true;
time += 5_000;
const saved = await fetcher("api/live/marine.json?check=2");
assert.ok(saved.headers.get("x-flagler-ios-cache"), "cached responses identify their cache provenance");
assert.deepEqual(await saved.json(), body);
assert.equal(staleAt, 1_800_000_000_000);
await assert.rejects(fetcher("api/live/unknown.json"), TypeError);

// Relative non-API requests (bundled files such as img/CREDITS.json) must pass through untouched.
const passthrough = createCachedFetch({ base, pagesBase, storage, fetchImpl: async (url) => new Response(String(url)) });
assert.equal(await (await passthrough("img/CREDITS.json")).text(), "img/CREDITS.json");

console.log("iOS bridge URL rewriting and saved JSON fallback checks passed.");
