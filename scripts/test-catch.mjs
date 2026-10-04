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

// Confidence reflects input freshness/completeness only.
{
  const now = new Date('2026-10-04T16:00:00Z'), ago = (ms) => new Date(+now - ms), H = 3600e3, M = 60e3;
  const ok = { spot: 'surf', now, forecastUpdated: ago(30 * M), alertsKnown: true, tidesOk: true, buoyAt: ago(20 * M), obsAt: ago(40 * M) };
  const c = (patch) => biteConfidence({ ...ok, ...patch });
  assert.deepEqual(c({}), { level: 'high', label: 'High confidence', reasons: [] });
  assert.equal(c({ buoyAt: null }).level, 'moderate');
  assert.deepEqual(c({ buoyAt: null }).reasons, ['No recent offshore reading.']);
  assert.equal(c({ buoyAt: ago(2 * H) }).level, 'moderate');
  assert.match(c({ buoyAt: ago(2 * H) }).reasons[0], /120 min old/);
  assert.equal(c({ forecastUpdated: ago(4 * H) }).level, 'moderate');
  assert.equal(c({ forecastUpdated: ago(7 * H) }).level, 'low', 'forecast over 6 h is a severe gap');
  assert.equal(c({ forecastUpdated: new Date(NaN) }).level, 'moderate', 'unknown issue time is a minor gap');
  assert.equal(c({ buoyAt: null, obsAt: null }).level, 'low', 'two minor gaps');
  assert.equal(c({ alertsKnown: false }).level, 'low');
  assert.match(c({ alertsKnown: false }).reasons[0], /alerts unverified/);
  assert.equal(c({ tidesOk: false }).level, 'high', 'surf ignores tide predictions');
  assert.equal(c({ spot: 'inshore', tidesOk: false }).level, 'low');
  assert.equal(c({ spot: 'inshore', buoyAt: null }).level, 'high', 'inshore ignores the offshore buoy');
  assert.equal(c({ forecastUpdated: new Date(+now + 2 * M) }).level, 'high', 'small clock skew is not stale');
}
console.log('confidence tests passed');
