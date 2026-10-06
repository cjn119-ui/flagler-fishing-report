import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";
import { SPECIES } from "../site/v5/species.js";
import { loadFirstCoastHistory } from "../site/v5/engine/history.js";
import { buildPredictionRun } from "../site/v5/engine/run.js";
import { validatePredictionRun, validateNormalizedObservation, validateSpeciesPrediction } from "../site/v5/engine/contracts.js";
import { buildArchiveBundle, restoreArchiveBundle, uploadArchiveBundle } from "./archive-v5.mjs";

const ROOT=fileURLToPath(new URL("../",import.meta.url)), fixture=JSON.parse(await readFile(resolve(ROOT,"scripts/fixtures/v5/run-inputs.json"),"utf8"));
const history=await loadFirstCoastHistory({readJson:async()=>JSON.parse(await readFile(resolve(ROOT,"site/v5/data/first-coast-history.json"),"utf8"))});
const params={now:fixture.now,locations:ACTIVE_SPOTS,species:SPECIES,history,observations:fixture.observations,catalogHash:"fixture-catalog",codeRevision:"fixture"};
const miniLocations=[ACTIVE_SPOTS.find(x=>x.modes.includes("surf"))],miniSpecies=SPECIES.filter(x=>["whiting","pompano"].includes(x.id)),smallParams={...params,locations:miniLocations,species:miniSpecies};
let passed=0,failed=0;const check=async(name,fn)=>{try{await fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.log(`FAIL ${name}: ${e?.stack??e}`);}};
let miniBaseline=null;
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value);
const build=async(extra={})=>buildPredictionRun({...params,...extra});
const gzipSize=value=>gzipSync(canonical(value)).byteLength;

const built=await build();
await check("recorded fixture inputs satisfy A2 normalized observation contracts",()=>{for(const [i,input] of fixture.observations.entries())assert.equal(validateNormalizedObservation(input),true,`fixture observation ${i}`);});
await check("fixture forecast and tide observations use real adapter output shapes and expose gust/thunder",()=>{const g=fixture.observations.find(x=>x.kind==="gridForecast"),t=fixture.observations.find(x=>x.kind==="tidePredictions");assert.ok(g.values.windGust&&g.values.probabilityOfThunder);assert.equal(g.values.rows,undefined);assert.ok(t.values.rows.some(x=>["H","L"].includes(x.type)));assert.ok(t.values.rows.every(x=>Number.isFinite(Date.parse(x.time))&&Number.isFinite(x.heightFt)));});
await check("both emitted horizons satisfy A1 PredictionRun validators",()=>{assert.equal(validatePredictionRun(built.today),true);assert.equal(validatePredictionRun(built.tomorrow),true);});
await check("inshore predictions and lazy history details carry validated coded season context",()=>{const prediction=built.today.candidates.find(x=>x.mode==="inshore"&&x.historyNotes?.some(n=>n.code==="history.inshoreSpread"));assert.ok(prediction,"fixture should emit an inshore history detail");assert.ok(["relativeCapped","absoluteOnly"].includes(prediction.seasonBasis));assert.ok(Number.isFinite(prediction.seasonAbsoluteReference)&&prediction.seasonAbsoluteReference>0);assert.equal(typeof prediction.seasonReferenceFallback,"boolean");assert.equal(validateSpeciesPrediction(prediction),true);const detail=built.details[prediction.detailsRef],row=detail?.rows.find(x=>x.speciesId===prediction.speciesId);assert.ok(row);assert.ok(row.historyNotes.some(n=>n.code==="history.inshoreSpread"));assert.equal(row.seasonBasis,prediction.seasonBasis);assert.equal(row.seasonAbsoluteReference,prediction.seasonAbsoluteReference);assert.ok(row.slots.every(slot=>{const season=slot.factors.find(f=>f.key==="season");return !season||!/%|probability/i.test(season.detail.text);}));});
await check("gzip payload and lazy details respect the published budgets",()=>{assert.ok(gzipSize(built.today)<=250*1024);assert.ok(gzipSize(built.tomorrow)<=250*1024);assert.ok(gzipSize({schemaVersion:1,today:built.today.id,tomorrow:built.tomorrow.id,details:Object.keys(built.details)})<=10*1024);for(const d of Object.values(built.details))assert.ok(gzipSize(d)<=100*1024);});
await check("same frozen inputs produce byte-identical run and detail JSON",async()=>{const again=await build();assert.equal(canonical(again.today),canonical(built.today));assert.equal(canonical(again.tomorrow),canonical(built.tomorrow));assert.equal(canonical(again.details),canonical(built.details));});
await check("one builder emits two horizons from identical normalized source inputs",()=>{assert.equal(built.today.inputs.observations.length,built.tomorrow.inputs.observations.length);assert.deepEqual(built.today.inputs.observations,built.tomorrow.inputs.observations);assert.notEqual(built.today.targetDate,built.tomorrow.targetDate);});
await check("targets, drivers, species focus and backups are eligibility-safe",()=>{for(const run of [built.today,built.tomorrow]){assert.ok(run.recommendation.targets.every(x=>x.eligibility==="realistic"));assert.ok(run.candidates.filter(x=>x.id===run.recommendation.backup?.id).every(x=>x.eligibility==="realistic"));for(const focused of Object.values(run.bySpecies))if(focused.focused)assert.equal(focused.focused.driverSpeciesId,SPECIES.find(x=>x.id===focused.focused.driverSpeciesId)?.id);assert.ok(run.candidates.filter(x=>x.eligibility!=="realistic").every(x=>x.band!=="Great fit"));}});
await check("real high-low tide fixture interpolates live timeline height and rate",()=>{const tides=built.tomorrow.slots.flatMap(x=>x.slots.map(s=>s.tide));assert.ok(tides.some(x=>Number.isFinite(x.heightFt)));assert.ok(tides.some(x=>Number.isFinite(x.rateFtPerHr)&&Math.abs(x.rateFtPerHr)>.01));});
await check("winning water provider and documented distant tide note reach location confidence metadata",()=>{assert.ok(built.today.locations.some(x=>Number.isFinite(x.tideDistanceMi)&&x.tideDistanceMi>15));const rows=Object.values(built.details).flatMap(x=>x.rows??[]).flatMap(x=>x.slots??[]);assert.ok(rows.some(x=>x.conditions.waterTempSource==="ocean-buoy"||x.conditions.waterTempSource==="co-ops-water-temperature"));});
await check("pressure does not fabricate a neutral trend beyond the newest reading",()=>{const refs=built.tomorrow.detailsRefs??[];const rows=Object.values(built.details).flatMap(x=>x.rows??[]).flatMap(x=>x.slots??[]);assert.ok(rows.some(x=>x.conditions&&x.conditions.pressureChange6hHpa===null));});
await check("late evening closes today cleanly while tomorrow refreshes",async()=>{const late=await build({now:"2026-10-06T02:15:00.000Z"});assert.equal(validatePredictionRun(late.today),true);assert.equal(validatePredictionRun(late.tomorrow),true);assert.equal(late.today.recommendation.state?.kind,"closed");assert.equal(late.today.recommendation.state?.code,"noRemainingWindowsToday");assert.equal(late.tomorrow.generatedAt,"2026-10-06T02:15:00.000Z");});
await check("timezone-less clock is rejected and malformed catalog rows are skipped with typed notes",async()=>{await assert.rejects(()=>build({now:"2026-10-05T12:00:00"}),/ISO instant with timezone/);const bad=await build({...smallParams,locations:[...miniLocations,{id:"broken",active:true,modes:[],lat:null,lon:null}]});assert.ok(bad.today.notes.some(x=>x.code==="invalidLocationSkipped"));});
await check("hourly range fallback uses its upper wind bound",async()=>{const observations=fixture.observations.map(x=>x.locationId===miniLocations[0].id&&x.kind==="gridForecast"?{...x,ok:false,values:{}}:x.kind==="hourlyForecast"?{...x,values:{rows:(x.values?.rows??[]).map(r=>({...r,windSpeed:"15 to 25 mph"}))}}:x),r=await build({...smallParams,observations});const conditions=Object.values(r.details).flatMap(x=>x.rows??[]).flatMap(x=>x.slots??[]).map(x=>x.conditions);assert.ok(conditions.some(x=>x.windMph===25));});
await check("seven-day outlook changes when its available forecast turns windy and rainy",async()=>{const observations=fixture.observations.map(o=>o.kind==="gridForecast"?{...o,values:Object.fromEntries(Object.entries(o.values).map(([k,rows])=>[k,rows.map(r=>({...r,value:k==="windSpeed"?24:k==="probabilityOfPrecipitation"?90:k==="probabilityOfThunder"?45:r.value}))]))}:o),rough=await build({observations});assert.ok(rough.today.days.slice(2).some(x=>x.outlookLabel==="Tough"));});
await check("overlapping slot keys, if present, have identical scores across horizons",()=>{const left=new Map(built.today.slots.flatMap(x=>x.slots.map(s=>[`${x.locationId}/${x.mode}/${s.at}`,s.suitability])));for(const x of built.tomorrow.slots)for(const s of x.slots){const k=`${x.locationId}/${x.mode}/${s.at}`;if(left.has(k))assert.equal(left.get(k),s.suitability);}});
await check("independent source failures keep runs valid and mark typed missing inputs",async()=>{
  const base=miniBaseline??(miniBaseline=await build(smallParams));
  const groups={forecast:new Set(["hourlyForecast","gridForecast"]),alerts:new Set(["alerts"]),tide:new Set(["tidePredictions"]),waves:new Set(["waves"]),waterTemperature:new Set(["waterTemperature"]),pressure:new Set(["pressureObservations"]),waveForecast:new Set(["waveForecast"])};
  for(const [name,kinds] of Object.entries(groups)){
    const observations=fixture.observations.map(x=>kinds.has(x.kind)?{...x,ok:false,stale:false,safeErrorCode:"fixture-failure"}:x), degraded=await build({...smallParams,observations});
    assert.equal(validatePredictionRun(degraded.today),true,name);assert.equal(validatePredictionRun(degraded.tomorrow),true,name);
    assert.ok(degraded.today.missingInputs.some(x=>kinds.has(x.kind))||degraded.tomorrow.missingInputs.some(x=>kinds.has(x.kind)),`missing ${name} typed marker`);
    const baseCandidates=[...base.today.candidates,...base.tomorrow.candidates], badCandidates=[...degraded.today.candidates,...degraded.tomorrow.candidates];
    assert.ok(badCandidates.some(x=>baseCandidates.some(b=>b.locationId===x.locationId&&b.mode===x.mode&&b.speciesId===x.speciesId&&b.confidence>x.confidence)),`${name} should lower confidence for an affected candidate`);
  }
});
await check("all-source failure remains valid, degraded, and lowers confidence",async()=>{
  const observations=fixture.observations.map(x=>({...x,ok:false,stale:false,safeErrorCode:"fixture-failure"})), degraded=await build({...smallParams,observations}), baseline=miniBaseline;
  assert.equal(validatePredictionRun(degraded.today),true);assert.equal(validatePredictionRun(degraded.tomorrow),true);assert.equal(degraded.today.status,"degraded");assert.equal(degraded.tomorrow.status,"degraded");
  assert.ok(degraded.today.recommendation.confidence<baseline.today.recommendation.confidence);assert.ok(degraded.tomorrow.recommendation.confidence<baseline.tomorrow.recommendation.confidence);assert.ok(degraded.today.recommendation.suitability<100&&degraded.tomorrow.recommendation.suitability<100);assert.ok([degraded.today,degraded.tomorrow].every(r=>r.recommendation.confidenceLevel==="Low"&&r.recommendation.headline.text.includes("Not enough current data")&&r.recommendation.reason.text.text.includes("Not enough current data")));
});
await check("carry-forward keeps original source age and records attempted time",async()=>{
  const baseline=miniBaseline,failed=fixture.observations.map(x=>x.kind==="waves"?{...x,ok:false,values:{},safeErrorCode:"refresh-failed"}:x), carried=await build({...smallParams,observations:failed,previousRuns:[baseline.today,baseline.tomorrow]});
  const carriedWave=carried.today.inputs.observations.find(x=>x.kind==="waves");assert.ok(carriedWave);assert.equal(carriedWave.originalFetchedAt,fixture.now);assert.equal(carriedWave.attemptedAt,fixture.now);assert.equal(carriedWave.stale,true);assert.equal(carried.today.carriedForward,true);
});
await check("archive bundle restores exact normalized inputs and run projections by hash",async()=>{
  const bundle=await buildArchiveBundle({inputs:fixture.observations,today:built.today,tomorrow:built.tomorrow,generatedAt:fixture.now}), restored=await restoreArchiveBundle(bundle);
  assert.equal(restored.inputs.length,fixture.observations.length);assert.equal(restored.runs.length,2);assert.equal(restored.runs[0].id,built.today.id);assert.equal(restored.runs[1].id,built.tomorrow.id);
  const damaged={...bundle,files:{...bundle.files,"inputs.ndjson":bundle.files["inputs.ndjson"]+" "}};await assert.rejects(()=>restoreArchiveBundle(damaged),/hash mismatch/);
});
await check("remote archive activation refuses to run",async()=>{await assert.rejects(()=>uploadArchiveBundle(),/remote archive activation not enabled/);});

console.log(`\n${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
