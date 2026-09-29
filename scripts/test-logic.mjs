import assert from "node:assert/strict";
import { verdict, parseWindMph, classifyAlert, sun, sunEvents, parseTideSeries, seriesFromHilo, tideRate, pickWindows, dailyOutlook } from "../site/v2/logic.js";

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
assert.ok(wet[0].score < wins[0].score);
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
console.log("all logic tests passed");
