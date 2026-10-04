import assert from "node:assert/strict";
import { weeklyOutlook, dayScore, bandScore, nowScore } from "../site/shared/week.js";
import { verdict, parseWindMph, classifyAlert, sun, sunEvents, parseTideSeries, seriesFromHilo, tideRate, pickWindows, dailyOutlook } from "../site/shared/logic.js";

assert.equal(parseWindMph("5 to 10 mph"), 10);
assert.equal(parseWindMph("12 mph"), 12);
assert.equal(parseWindMph(""), null);

assert.equal(verdict({ windMph: 8, rainPct: 10, seasM: 0.6 }).label, "Go");
assert.equal(verdict({ windMph: 16, rainPct: 10 }).label, "Marginal");
assert.equal(verdict({ windMph: 8, rainPct: 65 }).label, "Skip");
assert.equal(verdict({ windMph: 8, rainPct: 10, seasM: 1.5 }).label, "Marginal");
assert.equal(verdict({ windMph: 8, rainPct: 10, alerts: [{ event: "Coastal Flood Advisory" }] }).label, "Go");
assert.equal(verdict({ windMph: 8, rainPct: 10, alerts: [{ event: "Rip Current Statement" }] }).label, "Marginal");
assert.equal(verdict({ windMph: 8, rainPct: 10, alerts: [{ event: "Tornado Warning" }] }).label, "Skip");
assert.equal(verdict({}).label, "Unknown");
assert.equal(verdict({ windMph: 8 }).label, "Go");                       // rain unknown but wind known
assert.equal(classifyAlert("Severe Thunderstorm Watch"), 2);

// Sun: Flagler Beach, 2026-09-29 -> ~7:16 AM / ~7:12 PM EDT (11:16 / 23:12 UTC) per the deployed report.
const s = sun("2026-09-29");
assert.ok(Math.abs(s.sunrise - Date.parse("2026-09-29T11:16:00Z")) < 4 * 60e3, s.sunrise.toISOString());
assert.ok(Math.abs(s.sunset - Date.parse("2026-09-29T23:12:00Z")) < 4 * 60e3, s.sunset.toISOString());

// Synthetic semidiurnal tide: 12.4 h period. Windows should land where the tide moves, not at slack.
const t0 = Date.parse("2026-09-29T00:00:00Z");
const rows = [];
for (let m = 0; m <= 72 * 60; m += 30) {
  const t = new Date(t0 + m * 60e3);
  rows.push({ t: t.toISOString().slice(0, 16).replace("T", " "), v: String(0.5 + 0.5 * Math.sin(2 * Math.PI * (m / 60) / 12.4)) });
}
const series = parseTideSeries(rows);
const now = new Date("2026-09-29T09:00:00Z");
const hourly = Array.from({ length: 60 }, (_, i) => ({ start: new Date(now.getTime() + i * 3600e3), end: new Date(now.getTime() + (i + 1) * 3600e3), windMph: 8, rainPct: 10, tempF: 80 }));
const wins = pickWindows({ now, series, hourly, events: sunEvents(now) });
assert.ok(wins.length >= 2 && wins.length <= 3, `windows: ${wins.length}`);
for (const w of wins) assert.ok(w.score > 0 && w.score <= 1);
assert.ok(wins[0].score >= wins[1].score);
assert.ok(Math.abs(wins[0].start - wins[1].start) >= 120 * 60e3);
// Heavy rain everywhere lowers the best score.
const wet = pickWindows({ now, series, hourly: hourly.map((h) => ({ ...h, rainPct: 90 })), events: sunEvents(now) });
assert.equal(wet.length, 0); // Skip-level forecast rain is never recommended
// Nothing outside daylight is ever picked.
for (const w of wins) { const hr = w.start.getUTCHours(); assert.ok(hr >= 10 && hr <= 24, `hour ${hr}`); }
assert.ok(tideRate(series, new Date(t0 + 3 * 3600e3)) > 0);

const days = dailyOutlook(Array.from({ length: 120 }, (_, i) => ({ start: new Date(t0 + i * 3600e3), end: new Date(t0 + (i + 1) * 3600e3), windMph: 8, rainPct: 10, tempF: 80 })), 5);
assert.ok(days.length >= 3 && days.every((d) => d.verdict.label === "Go"));
const hl = [{ time: new Date("2026-09-29T07:00:00Z"), h: 0.1 }, { time: new Date("2026-09-29T13:00:00Z"), h: 1.1 }, { time: new Date("2026-09-29T19:00:00Z"), h: 0.2 }];
const ser = seriesFromHilo(hl);
assert.equal(ser[0].h, 0.1); assert.equal(ser.at(-1).h, 0.2);
assert.ok(Math.abs(ser.find((p) => +p.time === +hl[1].time).h - 1.1) < 1e-9);
assert.ok(ser.every((p) => p.h >= 0.1 - 1e-9 && p.h <= 1.1 + 1e-9));            // never overshoots the extremes
assert.ok(ser.every((p, i) => i === 0 || p.time > ser[i - 1].time));
// Weekly outlook from NWS-style 12 h periods (first period is "Tonight": no daytime period for today).
const mk = (start, isDaytime, wind, pop, temp) => ({ startTime: start, isDaytime, windSpeed: wind, probabilityOfPrecipitation: { value: pop }, temperature: temp, shortForecast: "x" });
const wk = weeklyOutlook([
  mk("2026-09-29T18:00:00-04:00", false, "10 mph", 10, 68),
  mk("2026-09-30T06:00:00-04:00", true, "5 to 10 mph", 20, 88), mk("2026-09-30T18:00:00-04:00", false, "5 mph", 20, 70),
  mk("2026-10-01T06:00:00-04:00", true, "15 to 20 mph", 10, 85), mk("2026-10-01T18:00:00-04:00", false, "10 mph", 10, 70),
  mk("2026-10-02T06:00:00-04:00", true, "8 mph", 70, 80), mk("2026-10-02T18:00:00-04:00", false, "8 mph", 70, 70),
]);
assert.equal(wk.length, 4);
assert.equal(wk[0].day, "2026-09-29"); assert.equal(wk[0].hi, null); assert.equal(wk[0].lo, 68);
assert.equal(wk[1].verdict.label, "Go"); assert.equal(wk[2].verdict.label, "Skip"); assert.equal(wk[3].verdict.label, "Skip");
assert.equal(dayScore(5, 0), 100); assert.equal(dayScore(25, 100), 0);
assert.ok(dayScore(8, 10) > dayScore(18, 10) && dayScore(8, 10) > dayScore(8, 60));
assert.equal(bandScore(0, 55), 70); assert.equal(bandScore(1, 90), 69); assert.equal(bandScore(2, 80), 39); assert.equal(bandScore(null, 55), 55);
for (const d of wk) assert.ok(d.score >= [70, 40, 0][d.verdict.level] && d.score <= [100, 69, 39][d.verdict.level]);
assert.equal(nowScore({ windMph: 5, rainPct: 0, seasM: 0.5 }, 0), 100);
assert.ok(nowScore({ windMph: 9, rainPct: 17, seasM: 0.8 }, 0) >= 70);
assert.ok(nowScore({ windMph: 9, rainPct: 17, seasM: 1.5 }, 1) <= 69);
console.log("all logic tests passed");

// Missing forecast values must remain unknown, and hazards still win without weather.
assert.equal(verdict({ alerts: [{ event: "Tornado Warning" }] }).label, "Skip");
assert.equal(verdict({ seasM: 3 }).label, "Skip");
const unknownWeek = weeklyOutlook([mk("2026-09-30T06:00:00-04:00", true, "", null, 80)]);
assert.equal(unknownWeek[0].rain, null);
assert.equal(unknownWeek[0].score, null);
assert.equal(unknownWeek[0].verdict.label, "Unknown");
assert.equal(pickWindows({ now, series, hourly: [], events: sunEvents(now) }).length, 0);
assert.equal(pickWindows({ now, series: [], hourly, events: sunEvents(now) }).length, 0);
assert.equal(pickWindows({ now, series, hourly: hourly.map(p => ({ ...p, rainPct: null })), events: sunEvents(now) }).length, 0);
const changing = hourly.map((p, i) => ({ ...p, windMph: i % 2 ? 14 : 1 }));
for (const w of pickWindows({ now, series, hourly: changing, events: sunEvents(now) })) {
  const covered = changing.filter(p => p.start < w.end && p.end > w.start);
  assert.equal(w.windMph, Math.max(...covered.map(p => p.windMph)));
  const daylight = sunEvents(now);
  assert.ok(daylight.some((e, i) => e.kind === "sunrise" && daylight[i + 1]?.kind === "sunset" && w.start >= +e.t - 45 * 60e3 && w.end <= +daylight[i + 1].t + 45 * 60e3));
}
console.log("audit regression tests passed");
