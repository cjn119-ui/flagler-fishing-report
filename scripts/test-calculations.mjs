import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {msToMph,cToF,mToFt,RULES,verdict,parseWindMph,seriesFromHilo,heightAt,tideRate,pickWindows,sun,sunEvents,localDay} from '../site/shared/logic.js';
import {nowScore,dayScore,weeklyOutlook,GRID_FORECAST} from '../site/shared/week.js';
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
// Exact international unit definitions, with known reference values.
close(msToMph(.44704),1); close(mToFt(.3048),1); close(cToF(0),32); close(cToF(100),212);
assert.equal(parseWindMph('5 to 10 mph'),10);assert.equal(parseWindMph('Calm'),0);
assert.equal(parseWindMph('-5 mph'),null);assert.equal(parseWindMph('10 km/h'),null);
// Independently calculated: .45*.8 + .35*.87 + .20*1 = .8645.
assert.equal(nowScore({windMph:9,rainPct:13,seasM:.4},0),86);
// Remove sea weight: (.45*.8 + .35*.87)/.8 = .830625, NOT .8315 from 55/45.
assert.equal(nowScore({windMph:9,rainPct:13},0),83);
// A case where the previous approximate normalization rounded to the wrong result.
assert.equal(nowScore({windMph:5,rainPct:10},0),96);
assert.equal(dayScore(5,10),96);
assert.equal(nowScore({},2),null);assert.equal(dayScore(null,null),null);
assert.equal(nowScore({windMph:25,rainPct:100,seasM:2},2),0);
for (const [key,rule] of Object.entries(RULES)) {
  const inputKey={wind:'windMph',gust:'gustMph',seas:'seasM',rain:'rainPct'}[key];
  for (const [value,expected] of [[rule.marginal-.0001,0],[rule.marginal,1],[rule.skip-.0001,1],[rule.skip,2]]) {
    assert.equal(verdict({windMph:0,rainPct:0,[inputKey]:value}).level,expected,`${key}: ${value}`);
  }
}
for(let wind=0;wind<=30;wind+=.25) {
  const input={windMph:wind,rainPct:10,seasM:.5};
  const next={...input,windMph:wind+.25};
  assert.ok(nowScore(next,verdict(next).level)<=nowScore(input,verdict(input).level));
}
// Analytic tide: 0 to 1 ft over six hours. Quarter-span is (1-cos(pi/4))/2.
const t=Date.parse('2026-09-30T06:00:00Z');
const extremes=[{time:new Date(t),h:0},{time:new Date(t+6*3600e3),h:1}];
const curve=seriesFromHilo(extremes);
close(heightAt(curve,new Date(t+90*60e3)),(1-Math.SQRT1_2)/2);
close(heightAt(curve,new Date(t+3*3600e3)),.5);
assert.equal(heightAt(curve,new Date(t-1)),null);
const linear=Array.from({length:100},(_,i)=>({time:new Date(t+i*30*60e3),h:i*1.5}));
close(tideRate(linear,new Date(t+5*3600e3)),3); // 3 ft change in one hour.
const now=new Date(t+2*3600e3+17*60e3);
const forecast=Array.from({length:50},(_,i)=>({start:new Date(t+i*3600e3),end:new Date(t+(i+1)*3600e3),windMph:8,rainPct:10}));
const events=[{t:new Date(t),kind:'sunrise'},{t:new Date(t+48*3600e3),kind:'sunset'}];
const windows=pickWindows({now,series:linear,hourly:forecast,events});
assert.equal(windows.length,3);
for(const w of windows) {assert.ok(w.start>=now);assert.ok(w.end<=+now+24*3600e3);close(w.end-w.start,120*60e3);}
const shortEvents=[{t:new Date(t),kind:'sunrise'},{t:new Date(t+5*3600e3),kind:'sunset'}];
// A five-minute gap between half-hour samples must invalidate intersecting windows.
const gapStart=t+3*3600e3+5*60e3,gapEnd=gapStart+5*60e3;
const gapForecast=[{start:new Date(t),end:new Date(gapStart),windMph:8,rainPct:10},{start:new Date(gapEnd),end:new Date(t+48*3600e3),windMph:8,rainPct:10}];
for(const w of pickWindows({now:new Date(t+2*3600e3),series:linear,hourly:gapForecast,events:shortEvents})) assert.ok(w.end<=gapStart || w.start>=gapEnd);
// A brief adverse interval must not disappear between sample points.
const spikeForecast=[{start:new Date(t),end:new Date(gapStart),windMph:8,rainPct:10},{start:new Date(gapStart),end:new Date(gapEnd),windMph:25,rainPct:10},{start:new Date(gapEnd),end:new Date(t+48*3600e3),windMph:8,rainPct:10}];
for(const w of pickWindows({now:new Date(t+2*3600e3),series:linear,hourly:spikeForecast,events:shortEvents})) assert.ok(w.end<=gapStart || w.start>=gapEnd);
const flat=linear.map(p=>({...p,h:1}));
for(const w of pickWindows({now,series:flat,hourly:forecast,events})) assert.equal(w.parts.tide,0);
assert.equal(pickWindows({now,series:linear,hourly:forecast,events},{lengthMin:0}).length,0);
// Sort and discard yesterday BEFORE taking seven days, including overnight-first feeds.
const periods=Array.from({length:8},(_,i)=>({startTime:new Date(Date.UTC(2026,8,29+i,12)).toISOString(),isDaytime:true,windSpeed:'5 mph',probabilityOfPrecipitation:{value:0}}));
const week=weeklyOutlook(periods.reverse(),7,{today:'2026-09-30'});
assert.equal(week.length,7);assert.equal(week[0].day,'2026-09-30');assert.equal(week.at(-1).day,'2026-10-06');
assert.equal(localDay(new Date('2026-11-01T05:30:00Z')),'2026-11-01');
assert.equal(localDay(new Date('2026-11-01T06:30:00Z')),'2026-11-01');
// Test the worker's actual tide parser, including both repeated DST fall-back hours.
const workerSource=await readFile(new URL('../src/worker.mjs',import.meta.url),'utf8');
const sanitizedWorker = workerSource.replace(/^import\s+[\s\S]*?;/gm, '').replace('export default','const worker =');
const worker=vm.runInNewContext(sanitizedWorker+'; ({tideEvents,localDate,parseBuoy,sunriseSunset})',{Intl,Date,Map,Set,Math,Number,String,URL,console});
const dst=worker.tideEvents([{t:'2026-11-01 05:30',v:'1',type:'H'},{t:'2026-11-01 06:30',v:'0',type:'L'}]);
assert.equal(Date.parse(dst[1].time)-Date.parse(dst[0].time),3600e3);
for(const e of dst) assert.equal(worker.localDate(new Date(e.time)),'2026-11-01');
const marine=worker.parseBuoy('#YY MM DD hh mm WVHT DPD WTMP WSPD\n2026 09 30 01 26 0.4 10 27.6 MM',null);
assert.equal(marine.observed_at,'2026-09-30T01:26:00.000Z');assert.equal(marine.values.wave_height_m,.4);assert.equal(marine.values.wind_speed_ms,null);

// U.S. Naval Observatory reference minutes at 29.4749754,-81.1270035, UTC.
// https://aa.usno.navy.mil/api/rstt/oneday?date=2026-09-30&coords=29.4749754,-81.1270035&tz=0
for(const [date,rise,set] of [
  ['2026-09-30','2026-09-30T11:17:00Z','2026-09-30T23:11:00Z'],
  ['2026-06-21','2026-06-21T10:25:00Z','2026-06-22T00:27:00Z'],
  ['2026-12-21','2026-12-21T12:15:00Z','2026-12-21T22:30:00Z'],
]) {
  const rootSun=sun(date),reportSun=worker.sunriseSunset(date);
  close(+rootSun.sunrise,Date.parse(rise),60e3);close(+rootSun.sunset,Date.parse(set),60e3);
  close(Date.parse(reportSun.sunrise),Date.parse(rise),60e3);close(Date.parse(reportSun.sunset),Date.parse(set),60e3);
  assert.equal(localDay(rootSun.sunrise),date);assert.equal(localDay(rootSun.sunset),date);
  assert.ok(rootSun.sunset>rootSun.sunrise);
}

// Optional source cross-check against freshly downloaded official data.
if(process.argv[2]) {
  const dir=process.argv[2];const read=async name=>JSON.parse(await readFile(`${dir}/${name}.json`,'utf8'));
  const points=await read('points');assert.equal(GRID_FORECAST,points.properties.forecast);
  const hourly=(await read('hourly')).properties.periods.map(p=>({start:new Date(p.startTime),end:new Date(p.endTime),windMph:parseWindMph(p.windSpeed),rainPct:p.probabilityOfPrecipitation?.value??null}));
  const gmt=(await read('tide-gmt')).predictions;const local=(await read('tide-local')).predictions;
  const localText=d=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  };
  let matched=0;
  for(const row of gmt) {
    const expected=local.find(x=>x.t===localText(new Date(row.t.replace(' ','T')+':00Z'))&&x.type===row.type);
    if(expected){close(Number(row.v),Number(expected.v));matched++;}
  }
  assert.ok(matched>=10);const actualNow=new Date();
  const next12=hourly.filter(p=>p.end>actualNow && p.start<+actualNow+12*3600e3);
  const wind=Math.max(...next12.map(p=>p.windMph)),rain=Math.max(...next12.map(p=>p.rainPct));
  const sea=(await read('marine')).values.wave_height_m;
  const expectedRaw=100*(.45*Math.min(1,Math.max(0,(25-wind)/20))+.35*(100-rain)/100+.20*Math.min(1,Math.max(0,(2-sea)/1.5)));
  const v=verdict({windMph:wind,rainPct:rain,seasM:sea});
  const band=[[70,100],[40,69],[0,39]][v.level];
  const expectedScore=Math.min(band[1],Math.max(band[0],Math.round(expectedRaw)));
  assert.equal(nowScore({windMph:wind,rainPct:rain,seasM:sea},v.level),expectedScore);
  console.log(JSON.stringify({sourceGrid:points.properties.forecast,wind,rain,sea,raw:expectedRaw,expectedScore,matchedTideEvents:matched}));
  const hilo=gmt.map(p=>({time:new Date(p.t.replace(' ','T')+':00Z'),h:Number(p.v),type:p.type}));
  for(const w of pickWindows({now:actualNow,series:seriesFromHilo(hilo),hourly,events:sunEvents(actualNow)})) {
    const periods=hourly.filter(p=>p.start<w.end&&p.end>w.start);
    assert.equal(w.windMph,Math.max(...periods.map(p=>p.windMph)));assert.equal(w.rainPct,Math.max(...periods.map(p=>p.rainPct)));
    assert.ok(w.end<=+actualNow+24*3600e3);
    console.log(JSON.stringify({start:w.start,end:w.end,wind:w.windMph,rain:w.rainPct,score:w.score}));
  }
}
console.log('independent calculation checks passed');
