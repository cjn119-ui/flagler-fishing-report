import { validatePredictionRun } from "../engine/contracts.js";

const LIVE_FILES = ["../../api/v5/today.json", "../../api/v5/tomorrow.json"];
const SAMPLE_FILES = ["sample-rich.json", "sample-rich-tomorrow.json"];
const CACHE_KEYS = ["v5proto.live.today", "v5proto.live.tomorrow"];
const CACHE_BUDGET = 1_500_000;

function localDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function trimForCache(run) {
  const copy = structuredClone(run), target = localDate(`${run.targetDate}T12:00:00-04:00`);
  const next = localDate(Date.parse(`${run.targetDate}T12:00:00-04:00`) + 86400000);
  copy.candidates = (copy.candidates ?? []).reduce((best, candidate) => {
    const index = best.findIndex((row) => row.speciesId === candidate.speciesId);
    if (index < 0) best.push(candidate);
    else {
      const prior = best[index];
      const rank = (row) => (row.eligibility === "realistic" ? 1e6 : 0) + (row.suitability ?? -1);
      if (rank(candidate) > rank(prior)) best[index] = candidate;
    }
    return best;
  }, []);
  for (const observation of copy.inputs?.observations ?? []) {
    const rows = observation.values?.rows;
    if (!Array.isArray(rows)) continue;
    observation.values.rows = rows.filter((row) => {
      const at = row.startTime ?? row.validFrom ?? row.time;
      const date = localDate(at);
      return !date || date === target || date === next;
    });
  }
  if (JSON.stringify(copy).length > CACHE_BUDGET) {
    // Retain the UI's forecast horizon and source labels; older observation detail is not needed offline.
    for (const observation of copy.inputs?.observations ?? []) {
      const rows = observation.values?.rows;
      if (Array.isArray(rows)) observation.values.rows = rows.slice(0, 48);
    }
  }
  const size = JSON.stringify(copy).length;
  if (size > CACHE_BUDGET) throw new Error(`Trimmed ${run.horizon} run exceeds offline cache budget: ${size} chars`);
  return copy;
}

function valid(run, strict = true) {
  if (!strict) return !!run && typeof run === "object" && typeof run.id === "string" &&
    ["today", "tomorrow"].includes(run.horizon) && typeof run.generatedAt === "string" &&
    !!run.recommendation && Array.isArray(run.locations) && !!run.scopeViews;
  try { validatePredictionRun(run); return true; }
  catch { return false; }
}

function readPair(storage) {
  if (!storage) return null;
  try {
    const pair = CACHE_KEYS.map(key => JSON.parse(storage.getItem(key)));
    return pair.every(valid) ? pair : null;
  } catch { return null; }
}

function writePair(storage, pair) {
  if (!storage) return;
  try { pair.forEach((run, i) => storage.setItem(CACHE_KEYS[i], JSON.stringify(trimForCache(run)))); }
  catch { /* storage can be disabled or full */ }
}

async function fetchRun(fetchImpl, path, strict = true) {
  const response = await fetchImpl(path, { cache: "no-cache" });
  if (!response?.ok) throw new Error(`${path}: ${response?.status ?? "unavailable"}`);
  const run = await response.json();
  if (!valid(run, strict)) throw new Error(`${path}: invalid prediction run`);
  const cacheHeader = response.headers?.get?.("x-flagler-ios-cache") ?? "";
  return { run, fromCache: !!cacheHeader && !["false", "0", "miss"].includes(String(cacheHeader).toLowerCase()) };
}

export async function loadProtoData({ fetchImpl = globalThis.fetch, storage,
  online = globalThis.navigator?.onLine !== false } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const cached = readPair(storage);
  if (online) {
    try {
      const fetched = await Promise.all(LIVE_FILES.map(path => fetchRun(fetchImpl, path)));
      const live = fetched.map((item) => item.run);
      writePair(storage, live);
      const fromCache = fetched.some((item) => item.fromCache);
      return { today: live[0], tomorrow: live[1], source: fromCache ? "cached" : "live", offline: false };
    } catch { /* use the last valid pair or labeled samples below */ }
  }
  if (cached) return { today: cached[0], tomorrow: cached[1], source: "cached", offline: !online };
  const sample = await Promise.all(SAMPLE_FILES.map(path => fetchRun(fetchImpl, path, false)));
  return { today: sample[0].run, tomorrow: sample[1].run, source: "sample", offline: !online };
}
