// Records whether the deployed API data is fresh or a last-good restore, in site/api/refresh-status.json,
// so stale data is explicit (never silently served). Also decides when a stale deploy should still fail the run.
//   node scripts/refresh-status.mjs write <fresh|stale-last-good> [validationLog]   (env: RUN_ID, RUN_URL, EVENT)
//   node scripts/refresh-status.mjs check                                           (exit 1 if report older than STALE_FAIL_MIN)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const API = fileURLToPath(new URL("../site/api/", import.meta.url));
const MIN = 60e3;

export function buildStatus({ status, state, log = "", now = new Date(), env = {} }) {
  const reports = ["current-report", "next-day-report"].map((k) => state?.[k]?.generated_at).map(Date.parse).filter(Number.isFinite);
  const oldest = reports.length ? Math.min(...reports) : null;
  return {
    status,
    checked_at: now.toISOString(),
    oldest_report_generated_at: oldest == null ? null : new Date(oldest).toISOString(),
    oldest_report_age_min: oldest == null ? null : Math.round((+now - oldest) / MIN),
    reasons: log.split("\n").filter((l) => l.includes("✗")).map((l) => l.replace(/^\s*✗\s*/, "").trim()).slice(0, 12),
    run_id: env.RUN_ID ?? null,
    run_url: env.RUN_URL ?? null,
    event: env.EVENT ?? null,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, status, logPath] = process.argv.slice(2);
  if (mode === "write") {
    if (!["fresh", "stale-last-good"].includes(status)) throw new Error("status must be fresh or stale-last-good");
    const state = JSON.parse(await readFile(`${API}state.json`, "utf8").catch(() => "null"));
    const log = logPath ? await readFile(logPath, "utf8").catch(() => "") : "";
    const out = buildStatus({ status, state, log, env: process.env });
    await mkdir(API, { recursive: true });
    await writeFile(`${API}refresh-status.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out));
    if (status === "stale-last-good") console.log(`::warning::Deployed last-good data (oldest report ${out.oldest_report_age_min} min old): ${out.reasons.join("; ")}`);
  } else if (mode === "check") {
    const s = JSON.parse(await readFile(`${API}refresh-status.json`, "utf8"));
    const limit = Number(process.env.STALE_FAIL_MIN ?? 360);
    if (s.status !== "fresh" && !(s.oldest_report_age_min <= limit)) {
      console.error(`Last-good report is ${s.oldest_report_age_min} min old (limit ${limit}); failing the run.`);
      process.exit(1);
    }
  } else throw new Error("usage: refresh-status.mjs write|check");
}
