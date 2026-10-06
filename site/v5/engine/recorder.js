const ARCHIVE_SCHEMA_VERSION = 1;
const INPUT_FIELDS = ["provider", "kind", "locationId", "station", "units", "observedAt", "issuedAt",
  "validFrom", "validTo", "fetchedAt", "values", "ok", "stale", "usedFallback", "safeErrorCode", "error"];

function canonical(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}

function normalizedRows(inputs) {
  return (inputs ?? []).map(input => Object.fromEntries(INPUT_FIELDS.map(key => [key, input?.[key] ?? null])))
    .sort((a,b) => canonical(a).localeCompare(canonical(b)));
}

export function serializeNormalizedInputs(inputs) {
  const rows = normalizedRows(inputs);
  return rows.map(canonical).join("\n") + (rows.length ? "\n" : "");
}

async function sha256(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function recordNormalizedInputs({ run, inputs, pendingPredictions = [] }) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this runtime");
  const rows = normalizedRows(inputs), firstByHash = new Map(), archivedRows = [];
  for (const row of rows) {
    const inputHash = await sha256(canonical(row));
    if (firstByHash.has(inputHash)) archivedRows.push({ inputHash, duplicateOf: firstByHash.get(inputHash) });
    else {
      firstByHash.set(inputHash, inputHash);
      archivedRows.push({ ...row, inputHash });
    }
  }
  const inputsNdjson = archivedRows.map(canonical).join("\n") + (archivedRows.length ? "\n" : "");
  const hash = await sha256(inputsNdjson);
  return { archiveSchemaVersion: ARCHIVE_SCHEMA_VERSION, runId: run?.id ?? null,
    generatedAt: run?.generatedAt ?? null, status: "inputs-recorded-predictions-pending",
    pendingPredictions: [...pendingPredictions].sort(), inputCount: (inputs ?? []).length,
    inputsSha256: hash, inputsNdjson };
}
