// Builds site/api/*.json by running the Worker's own report + live-data code
// against an in-memory KV. Previous state is pulled from the deployed site so a
// failed upstream feed keeps the last good report instead of blanking the page.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.mjs";

const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");
const FORCE = process.env.FORCE_REFRESH === "true";
const REFRESH_MS = FORCE ? 0 : 3 * 60 * 60 * 1000; // regenerate a report once it is 3h old (always when forced)
const OUT = fileURLToPath(new URL("../site/api/", import.meta.url));
const TZ = "America/New_York";
const LIVE_FRESHNESS_MIN = { weather: 90, marine: 90, tides: 90 };

const store = new Map();
const deployedLive = new Map();
const env = {
  REPORTS: {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => void store.set(key, value),
  },
};

const nyParts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
}).formatToParts(d).map((p) => [p.type, p.value]));

const nyDay = (d) => { const p = nyParts(d); return `${p.year}-${p.month}-${p.day}`; };

// UTC instant whose New York wall time is `hour`:00 today (the Worker gates on that hour).
function scheduledAt(hour) {
  const now = Date.now();
  const top = Math.floor(now / 3.6e6) * 3.6e6;
  for (let h = -30; h <= 30; h++) {
    const d = new Date(top + h * 3.6e6);
    if (Number(nyParts(d).hour) % 24 === hour && nyDay(d) === nyDay(new Date(now))) return d.getTime();
  }
  throw new Error("could not resolve scheduled time");
}

function liveIsFresh(key, payload) {
  if (!payload || typeof payload !== "object" || payload.ok !== true) return false;
  const now = Date.now();
  if (key === "weather") {
    const observed = Date.parse(payload.observed_at ?? "");
    if (!Number.isFinite(observed)) return false;
    const ageMin = (now - observed) / 60_000;
    if (ageMin > LIVE_FRESHNESS_MIN.weather) return false;
    return Number.isFinite(payload.values?.temperature_c);
  }
  if (key === "marine") {
    const observed = Date.parse(payload.observed_at ?? "");
    if (!Number.isFinite(observed)) return false;
    const ageMin = (now - observed) / 60_000;
    if (ageMin > LIVE_FRESHNESS_MIN.marine) return false;
    return Number.isFinite(payload.values?.wave_height_m) || Number.isFinite(payload.values?.dominant_period_s);
  }
  if (key === "tides") {
    if (!Array.isArray(payload.events) || payload.events.length < 4) return false;
    const future = payload.events.filter((event) => Number.isFinite(Date.parse(event?.time)) && Date.parse(event.time) >= now);
    return future.length >= 4;
  }
  return true;
}

async function seedFromDeployed() {
  if (!SITE_URL) return;
  try {
    const res = await fetch(`${SITE_URL}/api/state.json`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const state = await res.json();
    for (const key of ["current-report", "next-day-report"]) {
      const r = state[key];
      if (r && r.forecast_grid === "JAX/89,29" && Date.now() - Date.parse(r.generated_at) < REFRESH_MS) store.set(key, JSON.stringify(r));
      else if (r) store.set(`stale:${key}`, JSON.stringify(r));
    }
  } catch (e) {
    console.warn("no previous state:", e.message);
  }

  try {
    for (const [path, key] of [["/api/live/weather", "weather"], ["/api/live/marine", "marine"], ["/api/live/tides", "tides"]]) {
      const res = await fetch(`${SITE_URL}${path}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const payload = await res.json();
      if (liveIsFresh(key, payload)) deployedLive.set(key, payload);
    }
  } catch (e) {
    console.warn("no previous live data:", e.message);
  }
}

async function runPipeline(cron, hour) {
  const ctx = { waitUntil: (p) => (ctx.p = p) };
  await worker.scheduled({ cron, scheduledTime: scheduledAt(hour) }, env, ctx);
  await ctx.p;
}

await seedFromDeployed();
const errors = [];
for (const [cron, hour] of [["0 10,11 * * *", 6], ["0 0,23 * * *", 19]]) {
  try { await runPipeline(cron, hour); } catch (e) { errors.push(e.message); console.error(e.message); }
}
// Failed refresh: fall back to the previous (older) report rather than nothing.
for (const key of ["current-report", "next-day-report"]) {
  if (!store.has(key) && store.has(`stale:${key}`)) store.set(key, store.get(`stale:${key}`));
}

await mkdir(`${OUT}live`, { recursive: true });
const get = async (path) => {
  const res = await worker.fetch(new Request(`https://local${path}`), env);
  return { status: res.status, body: await res.text() };
};
let wrote = 0;
for (const [path, file, key] of [
  ["/api/report", "report.json", null], ["/api/next-day-report", "next-day-report.json", null],
  ["/api/live/weather", "live/weather.json", "weather"], ["/api/live/marine", "live/marine.json", "marine"], ["/api/live/tides", "live/tides.json", "tides"],
]) {
  let { status, body } = await get(path);
  if (status !== 200) console.error(`${path} -> ${status} ${body.slice(0, 200)}`);
  else {
    try {
      const payload = JSON.parse(body);
      const fallback = key ? deployedLive.get(key) : null;
      if (key && !liveIsFresh(key, payload) && fallback && liveIsFresh(key, fallback)) {
        console.warn(`Using deployed ${key} fallback because the freshly generated live feed was stale or incomplete.`);
        body = JSON.stringify(fallback);
      }
    } catch {
      // Ignore parse failures here; the worker/API response is already non-JSON for an error.
    }
    wrote++;
  }
  // Always write a body: the client checks payload.ok, and static hosting can't return 503.
  await writeFile(`${OUT}${file}`, body);
}
await writeFile(`${OUT}state.json`, JSON.stringify({
  "current-report": JSON.parse(store.get("current-report") ?? "null"),
  "next-day-report": JSON.parse(store.get("next-day-report") ?? "null"),
}));
console.log(`wrote ${wrote}/5 endpoints`);
if (!store.has("current-report") && !store.has("next-day-report")) process.exit(1);

