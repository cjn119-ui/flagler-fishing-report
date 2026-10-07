const TIME_KEYS = new Set([
  "at", "start", "end", "time", "generatedAt", "validFrom", "validTo",
  "issuedAt", "observedAt", "expires", "startsAt", "endsAt", "fetchedAt",
  "updated", "timestamp"
]);

function shiftIsoStrings(value, deltaMs) {
  if (typeof value !== "string") return value;
  const d = new Date(value);
  if (!Number.isFinite(+d)) return value;
  return new Date(d.getTime() + deltaMs).toISOString();
}

function shiftRunTimes(run, deltaMs) {
  if (!run || !Number.isFinite(deltaMs) || deltaMs === 0) return run;
  const seen = new WeakSet();
  const rewrite = (node) => {
    if (node == null || typeof node !== "object") return node;
    if (seen.has(node)) return node;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = rewrite(node[i]);
      return node;
    }
    for (const [key, value] of Object.entries(node)) {
      if (TIME_KEYS.has(key) && typeof value === "string") {
        node[key] = shiftIsoStrings(value, deltaMs);
      } else if (value && typeof value === "object") {
        node[key] = rewrite(value);
      }
    }
    return node;
  };
  return rewrite(JSON.parse(JSON.stringify(run)));
}

function liveRunForState(run, def) {
  if (!def.live || !run || !run.generatedAt) return { run, now: Date.now() };
  const sampleNow = Date.parse(run.generatedAt);
  const now = Date.now();
  return { run: shiftRunTimes(run, now - sampleNow), now };
}
