import assert from 'node:assert/strict';
import { pickWindows, scoreSlot, sunEvents, seriesFromHilo } from '../site/shared/logic.js';
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
