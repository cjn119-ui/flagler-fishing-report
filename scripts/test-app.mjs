// Exercise root rendering and failure recovery with deterministic upstream feeds.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, access } from 'node:fs/promises';
import * as logic from '../site/v2/logic.js';
import * as week from '../site/shared/week.js';
import * as catchLogic from '../site/shared/catch.js';
class Element {
  constructor() { this.children = []; this.textContent = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; this.classList = { add(){}, remove(){} }; }
  setAttribute(k,v) { this.attrs[k] = v; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; this.textContent = ''; }
  addEventListener(event, fn) { this.listeners[event] = fn; }
  get childElementCount() { return this.children.length; }
  get lastElementChild() { return this.children.at(-1); }
}
const nodes = new Map();
const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
const now = new Date();
const hourly = Array.from({length: 36}, (_, i) => ({startTime: new Date(+now + (i-1)*3600e3).toISOString(), endTime: new Date(+now + i*3600e3).toISOString(), windSpeed:'8 mph', probabilityOfPrecipitation:{value:10}}));
const day = logic.localDay(now);
const tides = Array.from({length:16},(_,i)=>({t:new Date(+now+(i-4)*6*3600e3).toISOString().slice(0,16).replace('T',' '), v:String(i%2),type:i%2?'H':'L'}));
let mode = 'normal';
const storage = new Map();
const context = vm.createContext({...logic, ...week, ...catchLogic, Intl, Date, Math, Number, String, JSON, Object, URLSearchParams, AbortSignal, console,
  document:{ getElementById:get, querySelector:get, createElement:()=>new Element(), createTextNode:text=>({textContent:text}), addEventListener(){} },
  navigator:{onLine:true}, window:{addEventListener(){}}, addEventListener(){}, setInterval(){},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  fetch:async url=>{
    if(mode==='offline') throw Error('offline');
    if(mode==='alert-only' && !url.includes('alerts')) throw Error('feed unavailable');
    if(mode==='no-tide' && url.includes('datagetter')) throw Error('tide unavailable');
    let data;
    if(url.includes('observations')) data={properties:{timestamp:now.toISOString(),temperature:{value:null},windSpeed:{value:0,unitCode:'wmoUnit:km_h-1'},windDirection:{value:0}}};
    else if(url.includes('/hourly')) data={properties:{periods:hourly.map(p=>mode==='missing'?{...p,windSpeed:'',probabilityOfPrecipitation:{value:null}}:p)}};
    else if(url.includes('alerts')) data={features:mode==='alert-only'?[{properties:{event:'Tornado Warning',expires:new Date(+now+3600e3).toISOString()}}]:[]};
    else if(url.includes('datagetter')) data={predictions:tides};
    else if(url.includes('marine.json')) data={ok:true,observed_at:mode==='stale'?new Date(+now-4*3600e3).toISOString():now.toISOString(),values:{wave_height_m:null,water_temperature_c:null,dominant_period_s:null}};
    else data={properties:{updateTime:now.toISOString(),periods:[{startTime:day+'T06:00:00-04:00',isDaytime:true,windSpeed:'',probabilityOfPrecipitation:{value:null}}]}};
    return {ok:true,json:async()=>data};
  }
});
globalThis.document = context.document;
let source = await readFile(new URL('../site/main.js', import.meta.url),'utf8');
source = source.replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g,'').replace(/^refresh\(\);$/m,'');
vm.runInContext(source,context);
const run = async m=>{ mode=m; await vm.runInContext('refresh()',context); assert.equal(get('refresh').disabled,false); };
await run('normal');
assert.equal(get('v-badge').textContent,'Go');
assert.match(get('bite-label').textContent,/bite outlook/);
assert.equal(get('spot-surf').attrs['aria-pressed'],'true');
assert.match(get('bite-why').textContent,/surf unverified/);
get('spot-inshore').listeners.click();
assert.equal(get('spot-inshore').attrs['aria-pressed'],'true');
assert.match(get('bite-why').textContent,/Smith Creek/);
assert.equal(storage.get('flagler-fishing-spot-v1'),'inshore');
get('spot-surf').listeners.click();
await run('no-tide');
assert.match(get('bite-label').textContent,/bite outlook/);
get('spot-inshore').listeners.click();
assert.equal(get('bite-label').textContent,'Prediction unavailable');
assert.match(get('bite-why').textContent,/Smith Creek tide predictions unavailable/);
get('spot-surf').listeners.click();
assert.match(get('coverage').textContent,/excludes seas/);
assert.ok(!JSON.stringify(get('stats')).includes('32'));
assert.match(get('.ring').attrs['aria-label'],/out of 100/);
assert.match(JSON.stringify(get('week-chart')),/unknown/);
await run('stale');
assert.match(get('status').textContent,/stale buoy/);
await run('missing');
assert.equal(get('v-badge').textContent,'Unconfirmed');
assert.match(get('status').textContent,/incomplete/);
await run('offline');
assert.equal(get('v-badge').textContent,'Unconfirmed');
assert.match(get('coverage').textContent,/Saved data/);
assert.match(JSON.stringify(get('windows')),/unavailable/);
assert.equal(get('bite-label').textContent,'Prediction unavailable');
await run('alert-only');
assert.equal(get('v-badge').textContent,'Skip');
assert.match(JSON.stringify(get('windows')),/withheld/);
assert.equal(get('bite-label').textContent,'Prediction unavailable');

// Every precached app dependency must exist, even before a user visits it.
const sw = await readFile(new URL('../site/service-worker.js',import.meta.url),'utf8');
new vm.Script(sw, { filename: 'service-worker.js' });
new vm.Script(await readFile(new URL('../site/v3/sw.js',import.meta.url),'utf8'), { filename: 'v3/sw.js' });
const shell = vm.runInNewContext(sw.match(/const SHELL = (\[[^;]+\]);/)[1]);
for (const path of shell) await access(new URL('../site/'+(path==='./'?'index.html':path),import.meta.url));
assert.ok(shell.some(p => p.startsWith('v2/logic.js')) && shell.some(p => p.startsWith('shared/week.js')) && shell.some(p => p.startsWith('shared/catch.js')));
console.log('app failure-state and offline shell tests passed');
