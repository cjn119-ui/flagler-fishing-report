import assert from 'node:assert/strict';
import { pickWindows, scoreSlot, sunEvents, seriesFromHilo } from '../site/shared/logic.js';
import { biteConfidence } from '../site/shared/catch.js';
import { biteOutlook, seasonalTargets } from '../site/shared/catch.js';

const now = new Date('2026-09-30T10:10:00-04:00');
const hourly = Array.from({ length: 30 }, (_, i) => ({
  start: new Date(+now - 10 * 60e3 + i * 3600e3),
  end: new Date(+now - 10 * 60e3 + (i + 1) * 3600e3),
  windMph: 8, rainPct: 10,
}));
const events = sunEvents(now);
const hilo = Array.from({ length: 12 }, (_, i) => ({
  time: new Date(+now - 18 * 3600e3 + i * 6 * 3600e3), h: i % 2 ? 4 : 0, type: i % 2 ? 'H' : 'L',
}));
const series = seriesFromHilo(hilo);
const surf = pickWindows({ now, hourly, events }, { habitat: 'surf' });
assert.ok(surf.length > 0);
assert.deepEqual(surf.map(w => [+w.start, w.score]), pickWindows({ now, hourly, events, series }, { habitat: 'surf' }).map(w => [+w.start, w.score]));
assert.ok(surf.every(w => w.parts.tide === null && w.end - w.start === 2 * 3600e3 && w.end <= +now + 24 * 3600e3));
assert.ok(surf.every((w, i) => surf.slice(i + 1).every(p => w.end <= p.start || p.end <= w.start)));
const inshore = pickWindows({ now, hourly, events, series }, { habitat: 'inshore' });
assert.ok(inshore.length > 0);
assert.ok(inshore.every(w => Number.isFinite(w.parts.tide)));
assert.equal(pickWindows({ now, hourly, events }, { habitat: 'inshore' }).length, 0);
assert.equal(pickWindows({ now, hourly: hourly.slice(2), events }, { habitat: 'surf' }).some(w => w.start < hourly[2].start), false);
assert.equal(pickWindows({ now, hourly: hourly.map((p, i) => i === 0 ? { ...p, windMph: 40 } : p), events }, { habitat: 'surf' }).some(w => w.start < hourly[0].end), false);

const slot = scoreSlot(new Date('2026-09-30T11:00:00-04:00'), { hourly, events, series: [], habitat: 'surf' });
assert.ok(slot && slot.parts.tide === null);
assert.equal(biteOutlook([{ score: .78 }]).label, 'Promising');
assert.equal(biteOutlook([{ score: .62 }]).label, 'Mixed');
assert.equal(biteOutlook([{ score: .619 }]).label, 'Slow');
assert.equal(biteOutlook([]), null);
assert.deepEqual(seasonalTargets('surf', 10), ['Whiting', 'Pompano', 'Croaker']);
assert.deepEqual(seasonalTargets('inshore', 10), ['Redfish', 'Spotted seatrout', 'Black drum']);
assert.ok(!seasonalTargets('surf', 1).includes('Pompano'));
console.log('bite outlook and habitat calculations passed');

// Confidence reflects input freshness, completeness and forecast uncertainty only.
{
  const now = new Date('2026-10-04T16:00:00Z'), ago = (ms) => new Date(+now - ms), H = 3600e3, M = 60e3;
  const win = (patch = {}) => ({ start: new Date(+now + 2 * H), windMph: 6, rainPct: 10, ...patch });
  const ok = { spot: 'surf', now, forecastUpdated: ago(30 * M), alertsKnown: true, tidesOk: true, buoyAt: ago(20 * M), obsAt: ago(40 * M), window: win(), obsWindMph: 5, forecastWindMph: 8 };
  const c = (patch) => biteConfidence({ ...ok, ...patch });
  assert.deepEqual(c({}), { level: 'high', label: 'High confidence', reasons: [] });

  // Data freshness and completeness
  assert.equal(c({ buoyAt: null }).level, 'moderate');
  assert.deepEqual(c({ buoyAt: null }).reasons, ['No recent offshore reading.']);
  assert.match(c({ buoyAt: ago(2 * H) }).reasons[0], /120 min old/);
  assert.equal(c({ forecastUpdated: ago(4 * H) }).level, 'moderate');
  assert.equal(c({ forecastUpdated: ago(7 * H) }).level, 'low', 'forecast over 6 h is a severe gap');
  assert.equal(c({ forecastUpdated: new Date(NaN) }).level, 'moderate', 'unknown issue time is a minor gap');
  assert.equal(c({ buoyAt: null, obsAt: null }).level, 'moderate', 'two one-point gaps stay Moderate');
  assert.equal(c({ buoyAt: null, obsAt: null, forecastUpdated: ago(4 * H) }).level, 'low', 'three points is Low');
  assert.equal(c({ alertsKnown: false }).level, 'low');
  assert.match(c({ alertsKnown: false }).reasons[0], /alerts unverified/);
  assert.equal(c({ tidesOk: false }).level, 'high', 'surf ignores tide predictions');
  assert.equal(c({ spot: 'inshore', tidesOk: false }).level, 'low');
  assert.equal(c({ spot: 'inshore', buoyAt: null }).level, 'high', 'inshore ignores the offshore buoy');
  assert.equal(c({ forecastUpdated: new Date(+now + 2 * M) }).level, 'high', 'small clock skew is not stale');

  // Forecast horizon: only windows more than 12 h out lose confidence
  assert.equal(c({ window: win({ start: new Date(+now + 12 * H) }) }).level, 'high');
  const far = c({ window: win({ start: new Date(+now + 20 * H) }) });
  assert.equal(far.level, 'moderate');
  assert.match(far.reasons[0], /starts in 20 h/);
  assert.equal(c({ window: null }).level, 'high', 'no window, nothing to rate for horizon or margin');

  // Margin to the caution/skip lines (wind 15/20 mph, rain 30/60 %): within 15% below a line
  assert.match(c({ window: win({ windMph: 14 }) }).reasons[0], /Wind 14 mph is near the 15 mph caution line/);
  assert.match(c({ window: win({ windMph: 18 }) }).reasons[0], /Wind 18 mph is near the 20 mph skip line/);
  assert.match(c({ window: win({ rainPct: 55 }) }).reasons[0], /Rain chance 55% is near the 60% skip line/);
  assert.equal(c({ window: win({ windMph: 12 }) }).level, 'high', 'comfortably under the line');
  assert.equal(c({ window: win({ windMph: 15 }) }).reasons.length, 0, 'already over the line: the score reflects it, no extra gap');
  assert.equal(c({ window: win({ windMph: 14, rainPct: 55 }) }).reasons.length, 1, 'only the first near-line reading is reported');

  // Airport vs forecast wind (forecast wind is the top of NWS's range, so calm airport readings are normal)
  assert.equal(c({ obsWindMph: 0, forecastWindMph: 10 }).level, 'high');
  assert.equal(c({ obsWindMph: 13, forecastWindMph: 8 }).level, 'high', '5 mph above is within tolerance');
  assert.match(c({ obsWindMph: 14, forecastWindMph: 8 }).reasons[0], /Airport wind \(14 mph\) is above the forecast \(8 mph\)/);
  assert.match(c({ obsWindMph: 2, forecastWindMph: 15 }).reasons[0], /well below the forecast/);
  assert.equal(c({ obsWindMph: null, forecastWindMph: 8 }).level, 'high', 'missing wind is not a disagreement');

  // Gaps accumulate: a far window with no buoy and a near-line wind is Low
  assert.equal(c({ buoyAt: null, window: win({ start: new Date(+now + 20 * H), windMph: 14 }) }).level, 'low');
}
console.log('confidence tests passed');
