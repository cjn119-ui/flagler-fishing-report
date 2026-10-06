// Integration check: every observation the A2 source layer emits (including failures and empty
// upstream responses) must satisfy the A1 NormalizedObservation contract.
import { fetchSources, clearSourceCache } from "../site/v5/engine/sources.js";
import { validateNormalizedObservation } from "../site/v5/engine/contracts.js";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const offline = async () => { throw new Error("offline"); };
const emptyOk = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" });

let failed = 0;
for (const [label, fetchImpl] of [["every source failing", offline], ["every source returning empty 200", emptyOk]]) {
  clearSourceCache();
  const out = await fetchSources({ locations: ACTIVE_SPOTS, fetchImpl, now: NOW });
  const list = Array.isArray(out) ? out : (out.observations ?? out.results ?? Object.values(out).flat());
  const errors = [];
  for (const o of list) { try { validateNormalizedObservation(o); } catch (e) { errors.push(e.message); } }
  const ok = list.length > 0 && errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${list.length - errors.length}/${list.length} observations satisfy the contract${errors.length ? ` (${[...new Set(errors)].slice(0, 3).join("; ")})` : ""}`);
}
console.log(failed ? `RESULT ${failed} failed` : "RESULT integration checks passed");
process.exit(failed ? 1 : 0);
