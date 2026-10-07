import { validatePredictionRun } from "../engine/contracts.js";

const LIVE_FILES = ["../../api/v5/today.json", "../../api/v5/tomorrow.json"];
const SAMPLE_FILES = ["sample-rich.json", "sample-rich-tomorrow.json"];
const CACHE_KEYS = ["v5proto.live.today", "v5proto.live.tomorrow"];

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
  try { pair.forEach((run, i) => storage.setItem(CACHE_KEYS[i], JSON.stringify(run))); }
  catch { /* storage can be disabled or full */ }
}

async function fetchRun(fetchImpl, path, strict = true) {
  const response = await fetchImpl(path, { cache: "no-cache" });
  if (!response?.ok) throw new Error(`${path}: ${response?.status ?? "unavailable"}`);
  const run = await response.json();
  if (!valid(run, strict)) throw new Error(`${path}: invalid prediction run`);
  return run;
}

export async function loadProtoData({ fetchImpl = globalThis.fetch, storage,
  online = globalThis.navigator?.onLine !== false } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  const cached = readPair(storage);
  if (online) {
    try {
      const live = await Promise.all(LIVE_FILES.map(path => fetchRun(fetchImpl, path)));
      writePair(storage, live);
      return { today: live[0], tomorrow: live[1], source: "live", offline: false };
    } catch { /* use the last valid pair or labeled samples below */ }
  }
  if (cached) return { today: cached[0], tomorrow: cached[1], source: "cached", offline: !online };
  const sample = await Promise.all(SAMPLE_FILES.map(path => fetchRun(fetchImpl, path, false)));
  return { today: sample[0], tomorrow: sample[1], source: "sample", offline: !online };
}
