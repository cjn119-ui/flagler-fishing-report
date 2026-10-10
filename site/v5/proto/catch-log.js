export const CATCH_SCHEMA_VERSION = 1;
export const CATCH_STORAGE_KEY = "v5proto.catches";

export function validateCatch(value, { now = Date.now(), spotById = () => null } = {}) {
  const errors = {};
  if (!value?.species || (value.species === "other" && !String(value.otherSpecies ?? "").trim())) errors.species = "Choose a species or enter its name.";
  const spot = spotById(value?.spot);
  if (!spot) errors.spot = "Choose a spot.";
  if (!spot?.modes?.includes(value?.mode)) errors.mode = "Choose a mode available at this spot.";
  const time = Date.parse(value?.occurredAt);
  if (!Number.isFinite(time)) errors.occurredAt = "Enter a date and time.";
  else if (time > now) errors.occurredAt = "Date and time cannot be in the future.";
  const count = Number(value?.count);
  if (!Number.isInteger(count) || count < 1 || count > 99) errors.count = "Count must be from 1 to 99.";
  if (!["kept", "released"].includes(value?.disposition)) errors.disposition = "Choose kept or released.";
  if (value?.lengthIn !== "" && value?.lengthIn != null) {
    const length = Number(value.lengthIn);
    if (!Number.isFinite(length) || length < 1 || length > 80) errors.lengthIn = "Length must be from 1 to 80 inches.";
  }
  if (String(value?.notes ?? "").length > 500) errors.notes = "Notes must be 500 characters or fewer.";
  return errors;
}

export function loadCatches(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(CATCH_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => x && x.schemaVersion === CATCH_SCHEMA_VERSION && x.id) : [];
  } catch { return []; }
}

export function saveCatches(rows, storage = globalThis.localStorage) {
  try { storage?.setItem(CATCH_STORAGE_KEY, JSON.stringify(rows)); return true; }
  catch { return false; }
}

export function summarizeCatches(rows, { now = Date.now(), timeZone = "America/New_York", spotName = (id) => id, speciesName = (id) => id } = {}) {
  const monthKey = (ms) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}`;
  };
  const month = monthKey(now);
  const current = rows.filter((x) => Number.isFinite(Date.parse(x.occurredAt)) && monthKey(Date.parse(x.occurredAt)) === month);
  const countBy = (items, key) => items.reduce((acc, x) => (acc.set(x[key], (acc.get(x[key]) ?? 0) + Number(x.count || 0)), acc), new Map());
  const top = (map) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0];
  return { catchesThisMonth: current.reduce((n, x) => n + Number(x.count || 0), 0), topSpecies: top(countBy(rows, "species")), bestSpot: top(countBy(rows, "spot")),
    topSpeciesName: top(countBy(rows, "species")) ? speciesName(top(countBy(rows, "species"))) : null,
    bestSpotName: top(countBy(rows, "spot")) ? spotName(top(countBy(rows, "spot"))) : null };
}

const csvCell = (x) => `"${String(x ?? "").replaceAll('"', '""')}"`;
export function catchesToCsv(rows) {
  const cols = ["date_time", "species", "spot", "mode", "count", "disposition", "length_inches", "bait_lure", "notes", "run_generated_at", "verdict", "fit"];
  return [cols.join(","), ...rows.map((x) => [x.occurredAt, x.species === "other" ? x.otherSpecies : x.speciesName, x.spotName, x.mode, x.count, x.disposition, x.lengthIn, x.bait, x.notes, x.context?.runGeneratedAt, x.context?.verdict, x.context?.fit].map(csvCell).join(","))].join("\r\n");
}
