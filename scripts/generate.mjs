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

const store = new Map();
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
for (const [path, file] of [
  ["/api/report", "report.json"], ["/api/next-day-report", "next-day-report.json"],
  ["/api/live/weather", "live/weather.json"], ["/api/live/marine", "live/marine.json"], ["/api/live/tides", "live/tides.json"],
]) {
  const { status, body } = await get(path);
  if (status !== 200) console.error(`${path} -> ${status} ${body.slice(0, 200)}`);
  else wrote++;
  // Always write a body: the client checks payload.ok, and static hosting can't return 503.
  await writeFile(`${OUT}${file}`, body);
}
await writeFile(`${OUT}state.json`, JSON.stringify({
  "current-report": JSON.parse(store.get("current-report") ?? "null"),
  "next-day-report": JSON.parse(store.get("next-day-report") ?? "null"),
}));
console.log(`wrote ${wrote}/5 endpoints`);
if (!store.has("current-report") && !store.has("next-day-report")) process.exit(1);
