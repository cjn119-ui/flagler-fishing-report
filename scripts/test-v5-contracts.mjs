import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SCHEMA_VERSION,MODEL_VERSION,createLocation,createConditions,createNormalizedObservation,createPredictionFactor,createFishingWindow,createSpeciesPrediction,createRecommendation,createPredictionRun,validateLocation,validateConditions,validateNormalizedObservation,validatePredictionFactor,validateFishingWindow,validateSpeciesPrediction,validateRecommendation,validatePredictionRun} from '../site/v5/engine/contracts.js';
import {MODEL_PARAMS,validateParams,canonicalize,hashModelParams} from '../site/v5/engine/params.js';
import {formatRunCopy} from '../site/v5/engine/copy.js';

let passed=0;
async function test(name,fn){try{await fn();passed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}: ${error.stack??error}`);process.exitCode=1;}}
const message=(text='Text')=>({code:'fixture',params:{},text});
const windowFixture=()=>createFishingWindow({id:'w1',locationId:'flagler-pier',mode:'pier',start:'2026-10-06T12:00:00Z',end:'2026-10-06T13:00:00Z',partOfDay:'morning',suitability:76,confidence:80,isOpenAtGenerated:true,startsInMinAtGenerated:0,endsInMinAtGenerated:60,gates:[]});
const reasonFixture={code:'tide',text:message('The tide is moving')};
const recFixture=(overrides={})=>createRecommendation({id:'r1',scope:{kind:'best'},focus:null,horizon:'today',locationId:'flagler-pier',mode:'pier',window:windowFixture(),driverSpeciesId:'whiting',verdict:'GO',suitability:76,displayName:'Flagler Beach Pier',modeLabel:message('Pier'),partOfDay:'morning',headline:message('Whiting on the incoming tide'),whenLabel:message('Today morning'),useLine:message('Shrimp on a rig'),reason:null,gates:[],caps:[],targets:[],setup:{},why:[],limitingFactor:null,confidence:80,confidenceLevel:'High',confidenceReasons:[{code:'forecast',params:{},text:message('Forecast is current'),penalty:0,kind:'live'}],confidenceSummary:message('Forecast and tides are current'),amberQualifier:null,backup:{kind:'nearby',reason:'Nearby pier',verdict:'MAYBE',distanceMi:4},nextOption:null,comparison:{kind:'similar'},tiedWith:[],rank:1,selection:{reason:'switched'},freshness:{ageMinutes:15,stale:false,usedFallback:false,status:'current'},...overrides});
const locationFixture=()=>createLocation({id:'flagler-pier',name:'Flagler Beach Pier',area:'Flagler Beach',county:'Flagler',active:true,modes:['pier','surf'],structure:'pier',lat:29.481,lon:-81.127,unknownOptional:'accepted'});
const runFixture=(overrides={})=>createPredictionRun({schemaVersion:{...SCHEMA_VERSION},id:'run-1',modelVersion:'future-model-is-informational',paramsHash:'abc',historyHash:'def',catalogHash:'ghi',codeRevision:'test',horizon:'today',targetDate:'2026-10-06',generatedAt:'2026-10-06T10:00:00.000Z',validFrom:'2026-10-06T10:00:00Z',validTo:'2026-10-07T04:00:00Z',region:'First Coast',status:'ok',carriedForward:false,missingInputs:[],recommendation:recFixture(),scopeViews:{},locations:[locationFixture()],bySpecies:{},slots:[],days:[{date:'2026-10-06'},{date:'2026-10-07'},{date:'2026-10-08'},{date:'2026-10-09'},{date:'2026-10-10'},{date:'2026-10-11'},{date:'2026-10-12'}],inputs:{sourceStatus:[{ageMinutes:15,stale:false,usedFallback:false,status:'current'}]},notes:[],detailsRefs:[],...overrides});

await test('constructors and nested validators accept valid domain contracts',()=>{
  const loc=locationFixture();assert.equal(validateLocation(loc),true);
  const cond=createConditions({locationId:loc.id,at:'2026-10-06T10:00:00Z',lightPhase:null,moonPhase:null,alerts:[],sourceStatus:[]});assert.equal(validateConditions(cond),true);
  const obs=createNormalizedObservation({provider:'fixture',kind:'wind',locationId:loc.id,units:{wind:'mph'},fetchedAt:'2026-10-06T10:00:00Z',values:{windMph:8},ok:true,stale:false,usedFallback:false});assert.equal(validateNormalizedObservation(obs),true);
  const factor=createPredictionFactor({key:'season',label:'Season',group:'season',humanLabel:message(),summary:message(),detail:message(),source:message(),available:true,limiting:false});assert.equal(validatePredictionFactor(factor),true);
  assert.equal(validateSpeciesPrediction(createSpeciesPrediction({id:'sp1',speciesId:'whiting',locationId:loc.id,mode:'pier',window:windowFixture(),suitability:76,band:'Great',confidence:80,eligibility:'realistic',eligibilityReason:{code:'history'},setup:{},useLine:message(),historicalRate:{rate:.12,n:100,lowSample:false,band:'Occasional',month:10,unit:'trips',sourceLabel:'pier and beach surveys'},seasonCurve:Array(12).fill(.2),waterFit:{state:'ideal'}})),true);
  assert.equal(validateFishingWindow(windowFixture()),true);assert.equal(validateRecommendation(recFixture()),true);
});

await test('run accepts unknown optional keys and newer minor/model versions',()=>{
  const run=runFixture({schemaVersion:{major:SCHEMA_VERSION.major,minor:SCHEMA_VERSION.minor+3,futureSchemaField:true},modelVersion:'future-model-99',futureOptional:{ok:true}});
  assert.equal(validatePredictionRun(run),true);
});

await test('rejects unsupported schema major with precise path',()=>{
  const run=runFixture({schemaVersion:{major:SCHEMA_VERSION.major+1,minor:0}});
  assert.throws(()=>validatePredictionRun(run),/run\.schemaVersion\.major: expected supported major/);
});

await test('rejects missing required fields and invalid eligibility with exact paths',()=>{
  const run=runFixture();delete run.historyHash;assert.throws(()=>validatePredictionRun(run),/run\.historyHash: expected required field/);
  const rec=recFixture();rec.targets=[{eligibility:'impossible'}];
  const species=createSpeciesPrediction({id:'sp1',speciesId:'whiting',locationId:'flagler-pier',mode:'pier',window:windowFixture(),suitability:70,band:'Great',calibratedProbability:null,confidence:70,confidenceReasons:[],eligibility:'impossible',eligibilityReason:{},caps:[],useLine:message(),historicalRate:{rate:null,n:null,lowSample:false,band:null,month:10,unit:'trips',sourceLabel:'pier and beach surveys'},seasonCurve:Array(12).fill(null),waterFit:{},detailsRef:null});
  assert.throws(()=>validateSpeciesPrediction(species),/speciesPrediction\.eligibility: expected one of realistic, rare, off-list, bycatch, no-structure/);
  assert.throws(()=>validateRecommendation({...rec,verdict:'SKIP',reason:null}),/recommendation\.reason: expected required for SKIP/);
});

await test('validates source freshness and strict UTC timestamps',()=>{
  const bad=runFixture();bad.inputs.sourceStatus=[{ageMinutes:1,stale:false,usedFallback:false,status:'current',fetchedAt:'2026-10-06T06:00:00-04:00'}];
  assert.throws(()=>validatePredictionRun(bad),/run\.inputs\.sourceStatus\[0\]\.fetchedAt: expected ISO-8601 UTC timestamp ending in Z/);
});

await test('parameters match approved values, placeholders, and hash canonically',async()=>{
  assert.equal(validateParams(),true);assert.equal(MODEL_PARAMS.history.realisticFloor,null);assert.equal(MODEL_PARAMS.thresholds.goSuitabilityMin,null);
  assert.equal(canonicalize({z:1,a:{y:2,x:3}}),'{"a":{"x":3,"y":2},"z":1}');
  const [one,two]=await Promise.all([hashModelParams(),hashModelParams(JSON.parse(JSON.stringify(MODEL_PARAMS)))]);assert.match(one,/^[a-f0-9]{64}$/);assert.equal(one,two);
  const bad=JSON.parse(JSON.stringify(MODEL_PARAMS));bad.weightsByMode.surf.season=.23;assert.throws(()=>validateParams(bad),/active weights must sum to 1/);
});

await test('canonical copy fixtures cover midnight countdown and elapsed window',async()=>{
  const files=['midnight.json','elapsed-window.json'];
  for(const file of files){const fixture=JSON.parse(await readFile(new URL(`./fixtures/v5/copy/${file}`,import.meta.url),'utf8'));assert.deepEqual(formatRunCopy(fixture.run,fixture.now),fixture.expected,file);}
});

await test('copy uses non-angling trip labels and qualitative low-sample bands',()=>{
  const run=runFixture();run.recommendation.mode='inshore';run.recommendation.targets=[{speciesId:'redfish',historicalRate:{rate:.08,n:45,lowSample:true,band:'Occasional',month:10,unit:'trips',sourceLabel:'river, bridge and bank surveys'}}];
  const text=formatRunCopy(run,'2026-10-06T11:00:00Z').historicalRates[0].text;
  assert.match(text,/Occasional in October surveys — low sample/);assert.match(text,/river, bridge and bank surveys/);assert.doesNotMatch(text,/angler|chance|probability/i);
});

if(!process.exitCode)console.log(`PASS ${passed} contract test groups (${MODEL_VERSION}; schema ${SCHEMA_VERSION.major}.${SCHEMA_VERSION.minor})`);
