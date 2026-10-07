// Proves the post-generation validator passes good output and fails the bugs it exists to catch.
import assert from "node:assert/strict";
import { validateGenerated, formatRows } from "./test-generated-output.mjs";
import { latestReport } from "../src/worker.mjs";

const now = new Date("2026-10-04T16:00:00Z"); // 12:00 EDT Sunday
const iso = (ms) => new Date(+now + ms).toISOString();
const MIN = 60e3, H = 3600e3;

const reportText = (dateLong, type) => [
  `Palm Coast / Flagler Beach — ${dateLong}`, "", `Report type: ${type}`, "",
  "Weather — Palm Coast",
  `• Official NWS forecast for ${dateLong}: high near 86°F; overnight low near 74°F.`,
  "• Rain/precipitation: maximum forecast probability 40%.", "",
  "Fishing Conditions — Flagler Beach",
  "• Tide: NOAA CO-OPS station 8720833 — Low near 2:25 AM EDT (0.4 ft); High near 8:09 AM EDT (0.9 ft).",
].join("\n");

const good = () => {
  const cur = { ok: true, report_date: "2026-10-04", generated_at: iso(-30 * MIN), report_text: reportText("Sunday, October 4, 2026", "Morning Report") };
  const nxt = { ok: true, report_date: "2026-10-05", generated_at: iso(-30 * MIN), report_text: reportText("Monday, October 5, 2026", "Next-Day Preview") };
  const tideAt = (h, height, type) => ({ time: iso(h * H), height_ft: height, type });
  return {
    report: cur, nextDay: nxt,
    state: {
      "current-report": { schema_version: 1, forecast_grid: "JAX/89,29", report_date: cur.report_date, generated_at: cur.generated_at },
      "next-day-report": { schema_version: 1, forecast_grid: "JAX/89,29", report_date: nxt.report_date, generated_at: nxt.generated_at },
    },
    weather: { ok: true, observed_at: iso(-50 * MIN), fetched_at: iso(-1 * MIN), values: { temperature_c: 27, wind_speed_ms: 2 }, forecast: { fetched_at: iso(-1 * MIN), updated_at: iso(-2 * H), high_f: 86, low_f: 74, precipitation_probability_pct: 30 } },
    marine: { ok: true, observed_at: iso(-20 * MIN), fetched_at: iso(-1 * MIN), values: { wave_height_m: 0.7, dominant_period_s: 9, water_temperature_c: 28 } },
    tides: { ok: true, fetched_at: iso(-1 * MIN), prediction_date: "2026-10-04", events: [tideAt(-3, 0.3, "Low"), tideAt(3.2, 1.1, "High"), tideAt(9.4, 0.3, "Low"), tideAt(15.6, 1.1, "High"), tideAt(21.8, 0.3, "Low"), tideAt(28, 1.1, "High")] },
  };
};
const hourlyOf = (patch = {}) => async () => ({
  updatedAt: new Date(+now - 40 * MIN),
  periods: Array.from({ length: 48 }, (_, i) => ({ start: new Date(+now + (i - 1) * H), end: new Date(+now + i * H), windMph: 6, rainPct: 10, ...patch })),
});
const run = (files, fetchHourly = hourlyOf(), env = {}) => validateGenerated({ files, now, fetchHourly, env });
const errorsOf = (rows) => rows.flatMap((r) => r.errors.map((e) => `${r.label}: ${e}`));
const expectFail = async (name, mutate, match, fetchHourly) => {
  const files = good(); mutate(files);
  const errs = errorsOf(await run(files, fetchHourly));
  assert.ok(errs.some((e) => match.test(e)), `${name}: expected an error matching ${match}, got ${JSON.stringify(errs)}`);
};

// Overnight current-day report: fixed 01:34 EDT clock and the stored next-day
// record are the source of truth for whether the public report is an evening preview.
{
  const overnight = new Date("2026-10-07T05:34:00Z");
  const overnightRun = (files, env = {}) => validateGenerated({ files, now: overnight, fetchHourly: async () => ({
    updatedAt: new Date(+overnight - MIN),
    periods: Array.from({ length: 48 }, (_, i) => ({ start: new Date(+overnight + (i - 1) * H), end: new Date(+overnight + i * H), windMph: 6, rainPct: 10 })),
  }), env });
  const eveningRecord = () => {
    const f = good();
    const generated = "2026-10-06T22:51:00Z"; // 18:51 EDT, 403 min before now
    const preview = { schema_version: 1, forecast_grid: "JAX/89,29", report_date: "2026-10-07", run_id: "cloudflare-next-day-2026-10-07", generated_at: generated };
    f.report = { ...preview, ok: true, report_text: reportText("Wednesday, October 7, 2026", "Next-Day Preview") };
    f.state["current-report"] = { ...preview };
    f.nextDay.report_date = "2026-10-08";
    f.nextDay.generated_at = f.state["next-day-report"].generated_at = new Date(+overnight - MIN).toISOString();
    f.nextDay.report_text = reportText("Thursday, October 8, 2026", "Next-Day Preview");
    f.state["next-day-report"].report_date = "2026-10-08";
    for (const k of ["weather", "marine", "tides"]) for (const key of ["fetched_at", "observed_at"]) if (f[k][key]) f[k][key] = new Date(+overnight - 5 * MIN).toISOString();
    f.weather.forecast.fetched_at = f.weather.forecast.updated_at = new Date(+overnight - 5 * MIN).toISOString();
    f.tides.prediction_date = "2026-10-07";
    f.tides.events = Array.from({ length: 6 }, (_, i) => ({ time: new Date(+overnight + (i - 1) * 6 * H).toISOString(), height_ft: i % 2 ? 1 : 0.3, type: i % 2 ? "High" : "Low" }));
    return f;
  };
  const rows = await overnightRun(eveningRecord());
  assert.deepEqual(errorsOf(rows), [], "01:34 EDT: prior evening preview is accepted");
  assert.match(formatRows(rows), /CURRENT\s+2026-10-07.*evening preview\s+PASS/);
  assert.match(formatRows(rows), /evening preview.*18-hour freshness exception/);
  assert.ok(errorsOf(await overnightRun(eveningRecord(), { MAX_EVENING_PREVIEW_AGE_MIN: "400" })).some((e) => /CURRENT: generated_at is stale/.test(e)), "evening preview age limit is configurable");

  const aged = eveningRecord(); aged.report.generated_at = aged.state["current-report"].generated_at = "2026-10-06T10:34:00Z";
  assert.ok(errorsOf(await overnightRun(aged)).some((e) => /CURRENT: generated_at is stale/.test(e)), "19-hour preview fails");
  const wrongDate = eveningRecord(); wrongDate.report.report_date = wrongDate.state["current-report"].report_date = "2026-10-06";
  assert.ok(errorsOf(await overnightRun(wrongDate)).some((e) => /CURRENT: report_date/.test(e)), "preview for a different date fails");
  const tooEarly = eveningRecord(); tooEarly.report.generated_at = tooEarly.state["current-report"].generated_at = "2026-10-06T19:00:00Z"; // 15:00 EDT
  assert.ok(errorsOf(await overnightRun(tooEarly)).some((e) => /CURRENT: generated_at is stale/.test(e)), "15:00 previous-day report gets no exception");
  const morning = eveningRecord();
  morning.report.report_text = reportText("Wednesday, October 7, 2026", "Morning Report");
  morning.report.generated_at = morning.state["current-report"].generated_at = "2026-10-07T00:00:00Z";
  morning.state["current-report"].run_id = "cloudflare-morning-2026-10-07";
  assert.ok(errorsOf(await overnightRun(morning)).some((e) => /CURRENT: generated_at is stale/.test(e)), "same-day morning report older than 240 min gets no exception");
}

// A failed current-day refresh must never make a future preview the current report.
{
  const current = { schema_version: 1, report_date: "2026-10-06", run_id: "old", generated_at: "2026-10-06T22:51:10.943Z", report_text: "old" };
  const future = { schema_version: 1, report_date: "2026-10-08", run_id: "preview", generated_at: "2026-10-07T05:20:26.481Z", report_text: "preview" };
  const env = { REPORTS: { get: async (key) => JSON.stringify(key === "current-report" ? current : future) } };
  assert.equal((await latestReport(env, new Date("2026-10-07T05:20:00Z"))).report_date, "2026-10-06");
  for (let ms = Date.parse("2026-10-07T04:00:00Z"); ms < Date.parse("2026-10-07T23:00:00Z"); ms += 15 * MIN) {
    const selected = await latestReport(env, new Date(ms));
    assert.ok(selected.report_date <= "2026-10-07", `future ${selected.report_date} was exposed at ${new Date(ms).toISOString()}`);
  }
  const priorPreview = { ...future, report_date: "2026-10-07" };
  const priorNightEnv = { REPORTS: { get: async (key) => JSON.stringify(key === "current-report" ? current : priorPreview) } };
  assert.equal((await latestReport(priorNightEnv, new Date("2026-10-07T03:55:00Z"))).report_date, "2026-10-07");
  assert.equal((await latestReport(priorNightEnv, new Date("2026-10-07T04:10:00Z"))).report_date, "2026-10-07");
}

// Baseline passes, with catch scores in range.
{
  const rows = await run(good());
  assert.deepEqual(errorsOf(rows), []);
  const surf = rows.find((r) => r.label === "CATCH SURF");
  assert.match(surf.detail, /^score=\d+$/);
  assert.match(formatRows(rows), /CURRENT\s+2026-10-04\s+fresh\s+PASS/);
  assert.match(formatRows(rows), /NEXT DAY\s+2026-10-05\s+fresh\s+PASS/);
}

// The bug class from the spec: right code, wrong generated data.
await expectFail("next-day is today", (f) => { f.nextDay.report_date = "2026-10-04"; f.nextDay.report_text = f.nextDay.report_text.replace("Monday, October 5", "Sunday, October 4"); }, /NEXT DAY: report_date is "2026-10-04", expected 2026-10-05/);
await expectFail("next-day is yesterday", (f) => { f.nextDay.report_date = "2026-10-03"; }, /NEXT DAY: report_date/);
await expectFail("current is yesterday", (f) => { f.report.report_date = "2026-10-03"; }, /CURRENT: report_date/);
await expectFail("text date wrong", (f) => { f.nextDay.report_text = f.nextDay.report_text.replaceAll("Monday, October 5, 2026", "Sunday, October 4, 2026"); }, /does not mention Monday, October 5, 2026/);
await expectFail("preview labelled morning", (f) => { f.nextDay.report_text = f.nextDay.report_text.replace("Next-Day Preview", "Morning Report"); }, /not labelled "Next-Day Preview"/);
await expectFail("report too old", (f) => { f.report.generated_at = iso(-5 * H); f.state["current-report"].generated_at = f.report.generated_at; }, /CURRENT: generated_at is stale/);
await expectFail("report from the future", (f) => { f.report.generated_at = iso(2 * H); f.state["current-report"].generated_at = f.report.generated_at; }, /in the future/);
await expectFail("state differs from served file", (f) => { f.state["next-day-report"].report_date = "2026-10-04"; }, /state\.json report differs/);
await expectFail("missing tide line", (f) => { f.report.report_text = f.report.report_text.replace(/• Tide:.*/, ""); }, /no tide high\/low line/);
await expectFail("missing high", (f) => { f.nextDay.report_text = f.nextDay.report_text.replace("high near 86°F", "high unavailable"); }, /NEXT DAY: report_text has no forecast high/);
await expectFail("undefined in text", (f) => { f.nextDay.report_text += "\n• Wind: undefined mph"; }, /literal "undefined"/);

// Live data staleness and nulls.
await expectFail("weather stale", (f) => { f.weather.observed_at = iso(-100 * MIN); }, /WEATHER: observed_at is stale: 100 min old, limit 90 min/);
await expectFail("marine fetched long ago", (f) => { f.marine.fetched_at = iso(-3 * H); }, /MARINE: fetched_at is stale/);
await expectFail("marine null wave", (f) => { f.marine.values.wave_height_m = null; }, /wave_height_m missing/);
await expectFail("weather NaN-ish temp", (f) => { f.weather.values.temperature_c = "NaN"; }, /temperature_c missing/);
await expectFail("weather precip out of range", (f) => { f.weather.forecast.precipitation_probability_pct = 140; }, /precipitation_probability_pct/);
await expectFail("impossible timestamp", (f) => { f.weather.observed_at = "not a date"; }, /observed_at is not a valid timestamp/);
await expectFail("tides empty", (f) => { f.tides.events = []; }, /only 0 tide events/);
await expectFail("tides wrong day", (f) => { f.tides.prediction_date = "2026-10-03"; }, /prediction_date/);
await expectFail("tides not alternating", (f) => { f.tides.events[1].type = "Low"; }, /does not alternate/);

// Catch prediction inputs.
await expectFail("hourly forecast empty", () => {}, /HOURLY: only 0 hourly periods/, async () => ({ updatedAt: new Date(+now - MIN), periods: [] }));
await expectFail("hourly forecast stale", () => {}, /HOURLY: updateTime is stale/, async () => ({ ...(await hourlyOf()()), updatedAt: new Date(+now - 9 * H) }));
await expectFail("hourly wind missing", () => {}, /HOURLY: wind missing in 48 of 48/, hourlyOf({ windMph: null }));
await expectFail("no windows in calm weather", (f) => { f.tides.events = f.tides.events.map((e) => ({ ...e, time: iso(-40 * H) })); }, /no tide event after now|no inshore window|inshore has none/);

// Legitimate states must not fail the deploy.
{
  const unreachable = await run(good(), async () => { throw new Error("503"); });
  assert.deepEqual(errorsOf(unreachable), [], "NWS outage must not block deploy");
  assert.ok(unreachable.some((r) => r.warnings.some((w) => /unreachable/.test(w))));
  const stormy = await run(good(), hourlyOf({ windMph: 25, rainPct: 80 }));
  assert.deepEqual(errorsOf(stormy), [], "Skip-level conditions legitimately produce no windows");
  // 7:30 PM EDT: the worker serves tomorrow's preview as /api/report; today's morning report lives only in state.json.
  const evening = new Date("2026-10-04T23:30:00Z");
  const at = (ms) => new Date(+evening + ms).toISOString();
  const eve = () => {
    const f = good();
    for (const k of ["weather", "marine", "tides"]) for (const key of ["fetched_at", "observed_at"]) if (f[k][key]) f[k][key] = at(-5 * MIN);
    f.weather.forecast.fetched_at = f.weather.forecast.updated_at = at(-5 * MIN);
    f.nextDay.generated_at = at(-H); f.state["next-day-report"].generated_at = at(-H);
    f.state["current-report"].generated_at = at(-4 * H);
    f.report = { ...f.nextDay };
    f.tides.events = f.tides.events.map((e, i) => ({ ...e, time: at((i - 1) * 6.2 * H) }));
    return f;
  };
  const evenHourly = async () => ({ updatedAt: new Date(+evening - MIN), periods: Array.from({ length: 48 }, (_, i) => ({ start: new Date(+evening + (i - 1) * H), end: new Date(+evening + i * H), windMph: 6, rainPct: 10 })) });
  const rows = await validateGenerated({ files: eve(), now: evening, fetchHourly: evenHourly });
  assert.deepEqual(errorsOf(rows), [], "evening: served preview is valid");
  assert.match(formatRows(rows), /CURRENT\s+2026-10-05 \(preview\)\s*fresh\s+PASS/);
  const stale = eve(); stale.report = { ...stale.report, report_date: "2026-10-04", report_text: stale.report.report_text.replace("Next-Day Preview", "Morning Report") };
  assert.ok(errorsOf(await validateGenerated({ files: stale, now: evening, fetchHourly: evenHourly })).some((e) => /CURRENT: report_date is "2026-10-04", expected 2026-10-05/.test(e)), "evening: serving today's report after 7 PM fails");
  const noMorning = eve(); noMorning.state["current-report"].report_date = "2026-10-03";
  assert.ok(errorsOf(await validateGenerated({ files: noMorning, now: evening, fetchHourly: evenHourly })).some((e) => /state\.json current-report is "2026-10-03"/.test(e)), "evening: yesterday's morning report in state fails");
}

// Limits are configurable.
{
  const files = good(); files.weather.observed_at = iso(-100 * MIN);
  assert.deepEqual(errorsOf(await run(files, hourlyOf(), { MAX_LIVE_AGE_MIN: "120" })), []);
}
console.log("generated-output validator tests passed");
