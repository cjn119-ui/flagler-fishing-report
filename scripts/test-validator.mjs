// Proves the post-generation validator passes good output and fails the bugs it exists to catch.
import assert from "node:assert/strict";
import { validateGenerated, formatRows } from "./test-generated-output.mjs";

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
