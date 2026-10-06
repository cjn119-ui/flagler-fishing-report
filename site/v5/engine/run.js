import { SCHEMA_VERSION, MODEL_VERSION, createPredictionRun, validatePredictionRun } from "./contracts.js";
import { MODEL_PARAMS, hashModelParams } from "./params.js";
import { scoreSpecies, selectDriver, chooseBackup, orderTargets, generateSlots } from "./model.js";
import { getHistoricalTiming } from "./history.js";
import { getAstronomy } from "./astro.js";
import { setupFor } from "../species.js";

const TZ = "America/New_York", SLOT_MS = 30 * 60000;
const utc = n => new Date(n).toISOString();
const localParts = value => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
const localDay = value => { const p=localParts(value); return `${p.year}-${p.month}-${p.day}`; };
const localHour = value => +localParts(value).hour;
const copy = (code,text,params={}) => ({code,params,text});
const has = n => typeof n === "number" && Number.isFinite(n);
const valueRows=obs=>Array.isArray(obs?.values)?obs.values:Array.isArray(obs?.values?.rows)?obs.values.rows:[];
const stable = x => Array.isArray(x) ? `[${x.map(stable).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}` : JSON.stringify(x);
async function sha256(text) { const d=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join(""); }

function sourceAge(obs, now) {
  const stamp=obs?.issuedAt ?? obs?.observedAt ?? obs?.fetchedAt;
  return Number.isFinite(Date.parse(stamp)) ? Math.max(0,(now-Date.parse(stamp))/60000) : null;
}
function freshEnough(obs, now, maxAgeMs) { return !!obs?.ok && !obs.stale && has(sourceAge(obs,now)) && sourceAge(obs,now)*60000<=maxAgeMs; }
function freshness(obs, now, label) {
  const age=sourceAge(obs,now), available=!!obs?.ok;
  return { kind:obs?.kind??label, label, status:!available?"unavailable":obs.stale?"stale":obs.usedFallback?"fallback":"current", available, ageMinutes:age, stale:!!obs?.stale, usedFallback:!!obs?.usedFallback, fetchedAt:obs?.fetchedAt??null, observedAt:obs?.observedAt??null, issuedAt:obs?.issuedAt??null, affects:obs?.kind??label };
}
function indexInputs(observations) {
  const m=new Map(),rank=o=>!o?.ok?0:o.stale?1:o.usedFallback?2:3; for(const o of observations??[]) { if(!o?.locationId||!o?.kind) continue; const k=`${o.locationId}\0${o.kind}`; const old=m.get(k); if(!old||rank(o)>rank(old)||rank(o)===rank(old)&&Date.parse(o.fetchedAt??0)>Date.parse(old.fetchedAt??0))m.set(k,o); }
  return m;
}
function carryInputs(current, previousRuns, now) {
  const map=indexInputs(current), carried=[];
  for(const run of previousRuns??[]) for(const old of run?.inputs?.observations??[]) {
    const k=`${old.locationId}\0${old.kind}`, present=map.get(k);
    if(present?.ok || !old?.ok || !Number.isFinite(Date.parse(old.fetchedAt)) || Date.parse(old.fetchedAt)>now) continue;
    const copyOld={...old, carriedForward:true, originalFetchedAt:old.originalFetchedAt??old.fetchedAt, attemptedAt:utc(now), stale:true};
    map.set(k,copyOld); carried.push(copyOld);
  }
  return { observations:[...map.values()].sort((a,b)=>`${a.locationId}/${a.kind}/${a.provider}`.localeCompare(`${b.locationId}/${b.kind}/${b.provider}`)), carried };
}
function intervalAt(rows, at) {
  const t=Date.parse(at); return rows.find(x=>Date.parse(x.validFrom??x.startTime??"")<=t && Date.parse(x.validTo??x.endTime??"")>t) ?? null;
}
function hourlyAt(obs, at) {
  if(!obs?.ok||obs.stale)return {};
  const x=intervalAt(valueRows(obs),at); if(!x)return {};
  const windText=String(x.windSpeed??""),windMatches=windText.match(/\d+(?:\.\d+)?/g),wind=windMatches?.length?Number(windMatches.at(-1)):NaN;
  return { windMph:Number.isFinite(wind)?wind:null, airTempF:has(x.temperature)?(x.temperatureUnit==="C"?x.temperature*9/5+32:x.temperature):null,
    rainPct:has(x.probabilityOfPrecipitation)?x.probabilityOfPrecipitation:null, thunder:typeof x.thunder==="boolean"?x.thunder:/thunder/i.test(x.shortForecast??"")?true:false,
    windDirectionDeg:({N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5})[x.windDirection]??null, validFrom:x.startTime??x.validFrom??null, validTo:x.endTime??x.validTo??null };
}
function pressureChange(obs, at) {
  if(!obs?.ok||obs.stale)return null;
  const rows=valueRows(obs).filter(x=>has(x.pressureHpa??x.pressurePa??x.value)&&Number.isFinite(Date.parse(x.at??x.timestamp??x.time))).map(x=>({t:Date.parse(x.at??x.timestamp??x.time),v:has(x.pressureHpa)?x.pressureHpa:has(x.pressurePa)?x.pressurePa/100:x.value})).sort((a,b)=>a.t-b.t);
  const t=Date.parse(at), newest=rows.at(-1);if(newest&&t-newest.t>3600000)return null;const now=rows.filter(x=>x.t<=t).at(-1), old=rows.filter(x=>x.t<=t-6*3600000).at(-1);
  return now&&old?now.v-old.v:null;
}
function tideAt(obs, at) {
  if(!obs?.ok||obs.stale)return {height:null,rate:null,direction:null};
  const rows=valueRows(obs).filter(x=>has(x.heightFt)&&["H","L"].includes(String(x.type).toUpperCase())&&Number.isFinite(Date.parse(x.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)),t=Date.parse(at);
  let i=rows.findIndex(x=>Date.parse(x.time)>t);if(i<1||i<0)return {height:null,rate:null,direction:null};
  const a=rows[i-1],b=rows[i],t0=Date.parse(a.time),t1=Date.parse(b.time),span=t1-t0;if(span<=0||span>12*3600000)return {height:null,rate:null,direction:null};
  const f=Math.max(0,Math.min(1,(t-t0)/span)),r0=String(a.type).toUpperCase(),rise=r0==="L",lo=rise?a.heightFt:b.heightFt,hi=rise?b.heightFt:a.heightFt,mid=(hi+lo)/2,amp=(hi-lo)/2,phase=Math.PI*f,height=mid-amp*Math.cos(phase),signed=rise?1:-1,rate=signed*amp*Math.PI*Math.sin(phase)/(span/3600000);
  return {height,rate,direction:Math.abs(rate)<0.02?"slack":rate>0?"incoming":"outgoing"};
}
function gridAt(obs, at) {
  if(!obs?.ok||obs.stale)return {};
  const field=name=>intervalAt(obs.values?.[name]??[],at)?.value;
  const dir=field("windDirection"), thunderPct=field("probabilityOfThunder"), p=field("probabilityOfPrecipitation");
  return {windMph:field("windSpeed"),windGustMph:field("windGust"),windDirectionDeg:dir,rainPct:p,thunderPct,thunder:has(thunderPct)?thunderPct>=50:null,airTempF:field("temperature")};
}
function observationsFor(map, loc) { return kind=>map.get(`${loc.id}\0${kind}`)??null; }
function conditionsAtFor(loc, map, now) {
  const get=observationsFor(map,loc);
  return at=>{
    const hourly=hourlyAt(get("hourlyForecast"),at),grid=gridAt(get("gridForecast"),at), current=get("pressureObservations"), tides=tideAt(get("tidePredictions"),at), buoy=get("waves"), water=get("waterTemperature"), wf=intervalAt(get("waveForecast")?.ok&&!get("waveForecast").stale?valueRows(get("waveForecast")):[],at);
    const weather={...hourly,...Object.fromEntries(Object.entries(grid).filter(([,v])=>v!==null&&v!==undefined))}, obsWave=freshEnough(buoy,now,3*3600000)?buoy.values:null, waterRow=valueRows(water).at(-1)??water?.values;
    return {at, windMph:weather.windMph??null, windGustMph:weather.windGustMph??null, windDirectionDeg:weather.windDirectionDeg??null,
      rainPct:weather.rainPct??null, thunder:weather.thunder??null, airTempF:weather.airTempF??null,
      waterTempF:water?.ok&&!water.stale&&has(waterRow?.temperatureC)?waterRow.temperatureC*9/5+32:water?.ok&&!water.stale&&has(waterRow?.waterTempF)?waterRow.waterTempF:null,
      waterTempSource:water?.ok&&!water.stale?(water.provider==="secoora"||water.provider==="ndbc"?"ocean-buoy":water.provider==="coops"?"co-ops-water-temperature":water.provider??"water-source"):null,
      waveHeightM:has(wf?.waveHeightM)?wf.waveHeightM:obsWave?.waveHeightM??null,
      tideHeightFt:tides.height,tideRateFtPerHr:tides.rate,tideDirection:tides.direction,pressureChange6hHpa:pressureChange(current,at),pressureHpa:null,
      alerts:get("alerts")?.ok?valueRows(get("alerts")):[], validFrom:weather.validFrom??wf?.validFrom??null,validTo:weather.validTo??wf?.validTo??null,
      lightPhase:null,moonPhase:null};
  };
}
function waveHasCoverage(obs, start, end, now, horizon) {
  if(horizon==="today") return freshEnough(obs,now,3*3600000);
  if(!obs?.ok||obs.stale||!obs.issuedAt||now-Date.parse(obs.issuedAt)>6*3600000)return false;
  let cursor=Date.parse(start); for(const x of [...valueRows(obs)].sort((a,b)=>Date.parse(a.validFrom)-Date.parse(b.validFrom))) {const a=Date.parse(x.validFrom),b=Date.parse(x.validTo); if(!has(x.waveHeightM)||a>cursor)continue;if(b>cursor)cursor=b;if(cursor>=Date.parse(end))return true;}return false;
}
function reasonFor(candidate,params=MODEL_PARAMS) {
  if(candidate.caps?.some(x=>x.code==="notEnoughCurrentData"))return {code:"notEnoughCurrentData",text:copy("notEnoughCurrentData","Not enough current data to assess fishing conditions.")};
  if(candidate.caps?.some(x=>x.code==="severeConditions"))return {code:"severeConditions",text:copy("severeConditions","Wind, surf or rain conditions limit this window.")};
  if(candidate.caps?.some(x=>x.code==="waterOutsideRange"))return {code:"waterOutsideRange",text:copy("waterOutsideRange","Water temperature is outside this species’ preferred range.")};
  if(candidate.caps?.some(x=>x.code==="outOfSeason"))return {code:"outOfSeason",text:copy("outOfSeason","Survey history is weak for this time of year.")};
  if(candidate.gates?.length)return {code:candidate.gates[0].code,text:candidate.gates[0].text};
  if(candidate.confidence<50)return {code:"lowConfidence",text:copy("recommendation.reason","Current conditions are uncertain, so treat this as a maybe.")};
  if(candidate.eligibility!=="realistic")return {code:"notRealistic",text:copy("notRealistic","Survey history or spot coverage does not support a realistic target.")};
  if(params.thresholds.goSuitabilityMin===null&&candidate.suitability>=params.thresholds.greatFit)return {code:"provisionalGoThreshold",text:copy("provisionalGoThreshold","This is a strong GO candidate, but the GO threshold is provisional; recommendation stays MAYBE.")};
  return {code:"conditions",text:copy("conditions","Conditions do not meet the GO threshold.")};
}
function compactSpeciesPrediction(pred, window, detailsRef) {
  const w={...window}; delete w.slots; delete w.mean; delete w.peak; delete w.peakSuitability; delete w.verdict; delete w.confidenceLevel; delete w.amberQualifier;
  return {id:`${pred.locationId}:${pred.mode}:${pred.speciesId}:${window.start}`,speciesId:pred.speciesId,locationId:pred.locationId,mode:pred.mode,window:w,suitability:window.suitability,
    band:pred.eligibility!=="realistic"?"Rare here":window.suitability>=70?"Great fit":window.suitability>=50?"Decent fit":window.suitability>=30?"Poor fit":"Not a fit",calibratedProbability:null,confidence:window.confidence,
    confidenceReasons:window.confidenceReasons,eligibility:pred.eligibility,eligibilityReason:pred.eligibilityReason,caps:window.caps??[],setup:setupFor(pred.species,pred.mode),
    useLine:copy("setup.where",setupFor(pred.species,pred.mode).where??"Use a presentation suited to this location."),historicalRate:pred.historicalRate??{rate:null,n:null,lowSample:false,band:null,month:1,unit:"trips",sourceLabel:pred.mode==="inshore"?"river, bridge and bank surveys":"pier and beach surveys"},
    seasonCurve:pred.seasonCurve??Array(12).fill(null),waterFit:pred.waterFit??{state:null,currentF:null},detailsRef};
}
function makeRecommendation({candidate,candidates,locations,species,horizon,targetDate,now,priorRun,scope,focus=null,hash,selectionOverride=null,params=MODEL_PARAMS}) {
  const spById=new Map(species.map(s=>[s.id,s])),locById=new Map(locations.map(l=>[l.id,l]));
  const sameScope=candidates.filter(x=>x.locationId===candidate.locationId&&x.mode===candidate.mode), bySpecies=new Map();
  for(const x of sameScope){if(bySpecies.has(x.speciesId))continue;const rows=(x.scoreRows??[]).filter(row=>Date.parse(row.at)>=Date.parse(candidate.start)&&Date.parse(row.at)<Date.parse(candidate.end)&&has(row.suitability));const fit=rows.length?Math.round(rows.reduce((sum,row)=>sum+row.suitability,0)/rows.length):x.suitability;bySpecies.set(x.speciesId,{...x,suitability:fit});}
  const sameWindow=[...bySpecies.values()];
  const targetCandidates=sameWindow.map(x=>({speciesId:x.speciesId,suitability:x.suitability,eligibility:x.eligibility,historicalRate:x.historicalRate,setup:setupFor(spById.get(x.speciesId),x.mode)}));
  const driver={speciesId:candidate.speciesId,suitability:candidate.suitability,eligibility:candidate.eligibility,historicalRate:candidate.historicalRate,setup:setupFor(spById.get(candidate.speciesId),candidate.mode)};
  const ranked=orderTargets(driver,targetCandidates).map(x=>{const s=spById.get(x.speciesId);return {speciesId:x.speciesId,name:s.name,suitability:x.suitability,band:x.eligibility!=="realistic"?"Rare here":x.suitability>=70?"Great fit":x.suitability>=50?"Decent fit":x.suitability>=30?"Poor fit":"Not a fit",eligibility:x.eligibility,eligibilityReason:sameWindow.find(c=>c.speciesId===x.speciesId)?.eligibilityReason??{},historicalRate:x.historicalRate,tags:[],setup:x.setup};});
  const loc=locById.get(candidate.locationId), startMs=Date.parse(candidate.start), endMs=Date.parse(candidate.end), w={id:candidate.id,locationId:candidate.locationId,mode:candidate.mode,start:candidate.start,end:candidate.end,partOfDay:candidate.partOfDay,suitability:candidate.suitability,confidence:candidate.confidence,isOpenAtGenerated:candidate.isOpenAtGenerated??(now>=startMs&&now<endMs),startsInMinAtGenerated:candidate.startsInMinAtGenerated??Math.max(0,Math.ceil((startMs-now)/60000)),endsInMinAtGenerated:candidate.endsInMinAtGenerated??Math.max(0,Math.ceil((endMs-now)/60000)),gates:candidate.gates??[]};
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs))throw new Error(`candidate missing window dates: ${JSON.stringify({candidateKeys:Object.keys(candidate),candidateStart:candidate.start,candidateEnd:candidate.end,window:candidate.window})}`);
  const recommendationId=`${hash.slice(0,12)}:${scope.kind}:${scope.locationId??"all"}:${focus?.speciesId??"none"}:${candidate.id}`;
  const prior=priorRun?.recommendation, samePrior=priorRun?.targetDate===targetDate&&prior?.locationId===candidate.locationId&&prior?.mode===candidate.mode&&prior?.scope?.kind===scope.kind&&(!focus||prior?.focus?.speciesId===focus.speciesId);
  const selection=selectionOverride??(samePrior?{reason:"held",heldFromRunId:priorRun.id,priorRecommendationId:prior.id,preferenceKey:"default"}:{reason:"switched",heldFromRunId:null,priorRecommendationId:null,preferenceKey:"default"});
  const rec={id:recommendationId,scope,focus,horizon,locationId:candidate.locationId,mode:candidate.mode,window:w,driverSpeciesId:candidate.speciesId,verdict:candidate.verdict,suitability:candidate.suitability,displayName:loc.name,modeLabel:copy("mode.label",candidate.mode),partOfDay:candidate.partOfDay,
    headline:copy("recommendation.headline",`${spById.get(candidate.speciesId).name} ${candidate.partOfDay} window`),whenLabel:copy("recommendation.when",`${horizon==="today"?"Today":"Tomorrow"} ${candidate.partOfDay}`),useLine:copy("recommendation.use",ranked[0]?.setup?.where??"Use a presentation suited to this location."),reason:candidate.verdict==="GO"?null:reasonFor(candidate,params),gates:candidate.gates??[],caps:candidate.caps??[],targets:ranked,setup:ranked[0]?.setup??{},why:(candidate.confidenceReasons??[]).map(x=>x.text),limitingFactor:null,
    confidence:candidate.confidence,confidenceLevel:candidate.confidenceLevel,confidenceReasons:candidate.confidenceReasons??[],confidenceSummary:copy("confidence.summary",(candidate.confidenceReasons??[]).map(x=>x.text?.text).filter(Boolean).join("; ")||"Forecast and marine conditions are available."),amberQualifier:candidate.amberQualifier??null,backup:null,nextOption:null,comparison:{kind:"similar"},tiedWith:[],rank:1,selection,freshness:freshness(candidate.forecastObs,now,"forecast")};
  if((candidate.caps??[]).some(x=>x.code==="notEnoughCurrentData"))rec.headline=copy("recommendation.noCurrentData","Not enough current data to assess fishing conditions.");
  rec.backup=chooseBackup({...candidate,spot:loc},candidates.map(x=>({...x,spot:locById.get(x.locationId),area:locById.get(x.locationId)?.area}))); return rec;
}
function planner(now, today, tomorrow, history, locations, observations, params) {
  const days=[],day0=localDay(now),forecast=[today,tomorrow];
  for(let i=0;i<7;i++) {
    const date=localDay(Date.parse(`${day0}T12:00:00Z`)+i*86400000);
    if(i<2){const r=forecast[i]?.recommendation;days.push({date,kind:"forecast",reason:copy("planner.forecast",`${i===0?"Today's":"Tomorrow's"} forecast conditions and safety gates determine this day.`),confidence:r?.confidence??5,verdict:r?.verdict??"MAYBE",windows:r?[r.window]:[],topSpecies:r?.targets?.slice(0,3)??[]});}
    else {const month=Number(date.slice(5,7)),sun=locations[0]?getAstronomy(date,locations[0].lat,locations[0].lon):null,slice=history?.ocean?.by_month?.[String(month)],rates=Object.values(slice?.target_species??{}).filter(x=>has(x.hitTrips)&&has(x.nTrips)&&x.nTrips>0).map(x=>x.hitTrips/x.nTrips),topRate=rates.length?Math.max(...rates):null;
      const grids=observations.filter(x=>x.kind==="gridForecast"&&x.ok&&!x.stale&&locations.some(l=>l.id===x.locationId)),onDate=v=>v.validFrom&&v.validTo&&Number.isFinite(Date.parse(v.validFrom))&&Number.isFinite(Date.parse(v.validTo))&&localDay(v.validFrom)<=date&&localDay(Date.parse(v.validTo)-1)>=date,dayValues=grids.flatMap(x=>[...(x.values?.windSpeed??[]),...(x.values?.probabilityOfPrecipitation??[]),...(x.values?.probabilityOfThunder??[])].filter(onDate)),winds=grids.flatMap(x=>(x.values?.windSpeed??[]).filter(onDate).map(v=>v.value).filter(has)),rains=grids.flatMap(x=>(x.values?.probabilityOfPrecipitation??[]).filter(onDate).map(v=>v.value).filter(has)),thunders=grids.flatMap(x=>(x.values?.probabilityOfThunder??[]).filter(onDate).map(v=>v.value).filter(has));
      const weatherRisk=Math.max(...winds,0)>=params.factors.conditionCaps.onshoreWindMph||Math.max(...rains,0)>=params.factors.conditionCaps.rainProbabilityPct||Math.max(...thunders,0)>=params.factors.conditionCaps.thunderProbabilityPct,seasonLabel=topRate==null?"Mixed":topRate>=MODEL_PARAMS.history.bands.commonMin?"Promising":topRate>=MODEL_PARAMS.history.bands.occasionalMin?"Mixed":"Tough",label=weatherRisk?"Tough":seasonLabel,forecastAvailable=dayValues.length>0;
      days.push({date,kind:"outlook",reason:copy("planner.outlook",weatherRisk?"Forecast wind or rain may limit this day.":seasonLabel==="Promising"?"Regional survey rates and available forecast conditions support a promising outlook.":seasonLabel==="Tough"?"Regional survey rates are low for this month.":"Regional survey support is mixed for this month."),confidence:forecastAvailable?55:35,outlookLabel:label,bestWindow:{partOfDay:sun?"morning":null,tidePhase:null}});}
  } return days;
}

/** Pure prediction pipeline: one normalized input set and candidate pass feed both local horizons. */
export async function buildPredictionRun({now,locations=[],species=[],history,observations=[],previousRuns=[],preferences={},params=MODEL_PARAMS,codeRevision="working-tree",catalogHash="unhashed"}={}) {
  const validNow=typeof now==="number"||typeof now==="string"&&/[zZ]|[+-]\d\d:\d\d$/.test(now),nowMs=typeof now==="number"?now:validNow?Date.parse(now):NaN; if(!Number.isFinite(nowMs))throw new TypeError("now must be an ISO instant with timezone"); if(!history)throw new TypeError("history is required");
  const catalogWarnings=[],active=locations.filter(x=>{if(x.active===false)return false;if(!x.id||!Array.isArray(x.modes)||!x.modes.some(m=>["surf","pier","inshore"].includes(m))||!has(x.lat)||!has(x.lon)||Math.abs(x.lat)>90||Math.abs(x.lon)>180){catalogWarnings.push({code:"invalidLocationSkipped",locationId:x.id??null});return false;}return true;}).map(x=>({...x,modes:x.modes.filter(m=>["surf","pier","inshore"].includes(m)),tideDistanceMi:x.tideDistanceMi??(Number(x.tideNote?.match(/([\d.]+)\s*mi/i)?.[1])||null)})),prev=Array.isArray(previousRuns)?previousRuns:[],carried=carryInputs(observations,prev,nowMs),obsMap=indexInputs(carried.observations);
  const historyHash=await sha256(stable(history)),paramsHash=await hashModelParams(params),inputsHash=await sha256(stable(carried.observations)), hashes={historyHash,paramsHash,inputsHash,catalogHash,codeRevision};
  const todayDate=localDay(nowMs),tomorrowDate=localDay(Date.parse(`${todayDate}T12:00:00Z`)+86400000), horizonSlots={today:generateSlots({now:nowMs,horizon:"today",params}),tomorrow:generateSlots({now:nowMs,horizon:"tomorrow",params})};
  const indexed=[],details={};
  for(const horizon of ["today","tomorrow"]) for(const loc of active) for(const mode of loc.modes??[]) {
    const modeSlots=horizonSlots[horizon], get=conditionsAtFor(loc,obsMap,nowMs), src=observationsFor(obsMap,loc), windObs=src("waveForecast");
    const forecast=[src("hourlyForecast"),src("gridForecast")].find(x=>x?.ok&&!x.stale), forecastAge=forecast?.issuedAt?Math.max(0,(nowMs-Date.parse(forecast.issuedAt))/3600000):null, alerts=src("alerts"), alertsChecked=!!alerts?.ok&&!alerts.stale;
    for(const s of species) {
      if(!s.modes?.includes(mode))continue;
      const scores=scoreSpecies({species:s,spot:loc,mode,history,slots:modeSlots,conditionsAt:get,now:utc(nowMs),horizon,forecastAgeHours:forecastAge,alertsChecked,
        waveCoverage:(at,h)=>h==="tomorrow"?waveHasCoverage(windObs,at,utc(Date.parse(at)+SLOT_MS),nowMs,h):freshEnough(src("waves"),nowMs,3*3600000),params});
      if(!scores)continue;
      const failedKinds=[...new Set(carried.observations.filter(o=>o.locationId===loc.id&&(!o.ok||o.stale)).map(o=>o.kind))];
      for(const w of scores.windows) {
        for(const kind of failedKinds){const reason={code:"sourceUnavailable",params:{kind},text:copy("confidence.sourceUnavailable","Some current data sources are unavailable."),penalty:5,kind:"live"};w.confidenceReasons=[...(w.confidenceReasons??[]),reason];}
        if(failedKinds.length){w.confidence=Math.max(params.confidence.minimum,w.confidence-failedKinds.length*5);w.confidenceLevel=w.confidence>=params.thresholds.highConfidenceMin?"High":w.confidence>=params.thresholds.moderateConfidenceMin?"Moderate":"Low";if(w.verdict==="GO")w.verdict="MAYBE";w.amberQualifier=w.confidence>=params.thresholds.moderateConfidenceMin?w.confidenceReasons.find(x=>x.kind==="live")?.text??null:null;}
        const avgWave=waveHasCoverage(windObs,w.start,w.end,nowMs,horizon), pred={...scores, speciesId:s.id,locationId:loc.id,mode,forecastObs:forecast,area:loc.area,window:w};
        const targetDate=horizon==="today"?todayDate:tomorrowDate, detailRunId=`${horizon}-${targetDate}-${utc(nowMs).replace(/\D/g,"").slice(0,14)}-${hashes.inputsHash.slice(0,10)}`;
        const detailKey=`details/${detailRunId}/${loc.id}-${mode}.json`;
        details[detailKey]??={runId:detailRunId,locationId:loc.id,mode,rows:[]};
        const full=scores.slots.filter(x=>Date.parse(x.at)>=Date.parse(w.start)&&Date.parse(x.at)<Date.parse(w.end));
        details[detailKey].rows.push({speciesId:s.id,windowId:w.id,slots:full.map(x=>({at:x.at,suitability:x.suitability,factors:x.factors,conditions:x.conditions}))});
        indexed.push({...pred,species:s,...w,scoreRows:scores.slots,id:`${loc.id}:${mode}:${s.id}:${w.start}`, targetDate:horizon==="today"?todayDate:tomorrowDate, scopeKey:"best",focusKey:"none",preferenceKey:"default",onTargetList:loc.targets?.includes(s.id)??false, catalogOrder:active.indexOf(loc), horizon, waveCoverage:avgWave, detailsRef:detailKey});
      }
    }
  }
  const allCandidates=indexed, runs={};
  for(const horizon of ["today","tomorrow"]) {
    const targetDate=horizon==="today"?todayDate:tomorrowDate, list=allCandidates.filter(x=>x.horizon===horizon);
    if(!list.length&&horizon==="today"){
      const future=allCandidates.find(x=>x.horizon==="tomorrow"&&x.eligibility==="realistic");
      if(!future)throw new Error(`No scored window available for tomorrow ${tomorrowDate}`);
      const runId=`today-${targetDate}-${utc(nowMs).replace(/\D/g,"").slice(0,14)}-${hashes.inputsHash.slice(0,10)}`,closed=makeRecommendation({candidate:future,candidates:[future],locations:active,species,horizon,targetDate,now:nowMs,scope:{kind:"best"},hash:runId});
      closed.verdict="SKIP";closed.suitability=0;closed.state={kind:"closed",code:"noRemainingWindowsToday",text:"No remaining windows today."};closed.headline=copy("recommendation.closed","No remaining windows today.");closed.reason={code:"noRemainingWindowsToday",text:copy("recommendation.closedReason","Today’s fishing windows have ended. Tomorrow’s forecast is available.")};closed.backup=null;
      const sourceStatus=carried.observations.filter(x=>active.some(l=>l.id===x.locationId)).map(x=>freshness(x,nowMs,x.kind)),missingInputs=sourceStatus.filter(x=>x.status==="unavailable"||x.stale).map(x=>({kind:x.kind,reason:x.status,locationId:null,text:copy(`missing.${x.kind}`,`${x.label} unavailable or stale.`)}));
      runs.today=createPredictionRun({schemaVersion:{...SCHEMA_VERSION},id:runId,modelVersion:MODEL_VERSION,paramsHash,historyHash,inputsHash,catalogHash,codeRevision,horizon,targetDate,generatedAt:utc(nowMs),validFrom:utc(nowMs),validTo:utc(nowMs+SLOT_MS),region:"First Coast",status:!sourceStatus.length||sourceStatus.every(x=>x.status==="unavailable")?"degraded":missingInputs.length?"partial":"ok",carriedForward:carried.carried.length>0,missingInputs,recommendation:closed,scopeViews:{best:{recommendationId:closed.id},byLocation:{},bySpecies:{}},locations:active.map(l=>({id:l.id,name:l.name,area:l.area,county:l.county,active:true,modes:l.modes,structure:l.structure,lat:l.lat,lon:l.lon,tideDistanceMi:l.tideDistanceMi})),bySpecies:{},candidates:[],slots:[],days:[],inputs:{sourceStatus,observations:[],priorSelection:null},notes:catalogWarnings,detailsRefs:[]});continue;
    }
    if(!list.length)throw new Error(`No scored window available for ${horizon} ${targetDate}`);
    const sameDatePrior=prev.find(x=>x?.targetDate===targetDate);
    const bestSelection=selectDriver(list,{previous:sameDatePrior?.recommendation?{...sameDatePrior.recommendation,targetDate,scopeKey:"best",focusKey:"none",runId:sameDatePrior.id,recommendationId:sameDatePrior.recommendation.id}:null,preferences,params}),best=bestSelection.selected;
    if(!best)throw new Error(`No eligible target window available for ${horizon} ${targetDate}`);
    const runId=`${horizon}-${targetDate}-${utc(nowMs).replace(/\D/g,"").slice(0,14)}-${hashes.inputsHash.slice(0,10)}`;
    const recommendation=makeRecommendation({candidate:best,candidates:list,locations:active,species,horizon,targetDate,now:nowMs,priorRun:sameDatePrior,scope:{kind:"best"},hash:runId,selectionOverride:bestSelection.selection,params});
    const byLocation={};for(const loc of active)for(const mode of loc.modes??[]){const key=`${loc.id}:${mode}`,xs=list.filter(x=>x.locationId===loc.id&&x.mode===mode);const selected=selectDriver(xs,{preferences,params});if(xs.length&&selected.selected){const view=makeRecommendation({candidate:selected.selected,candidates:list,locations:active,species,horizon,targetDate,now:nowMs,scope:{kind:"location",locationId:loc.id,mode},hash:runId,selectionOverride:selected.selection,params});byLocation[key]={candidateIds:xs.map(x=>x.id),recommendationId:view.id,recommendation:view};}}
    const bySpecies={};for(const s of species){const xs=list.filter(x=>x.speciesId===s.id),selected=selectDriver(xs,{preferences,params}),focused=selected.selected?makeRecommendation({candidate:selected.selected,candidates:list,locations:active,species,horizon,targetDate,now:nowMs,scope:{kind:"species",speciesId:s.id},focus:{speciesId:s.id},hash:runId,selectionOverride:selected.selection,params}):null;bySpecies[s.id]={best:selected.selected?.id??null,focusedRecommendationId:focused?.id??null,focused};}
    const timeline=[];for(const loc of active)for(const mode of loc.modes??[]){const matching=list.filter(x=>x.locationId===loc.id&&x.mode===mode);const times=(horizonSlots[horizon]??[]).map(at=>{const xs=matching.map(x=>x.slots.find(q=>q.at===at)).filter(Boolean).sort((a,b)=>(b.suitability??-1)-(a.suitability??-1)), c=conditionsAtFor(loc,obsMap,nowMs)(at), astro=getAstronomy(localDay(at),loc.lat,loc.lon);return {at,suitability:xs[0]?.suitability??null,tide:{heightFt:c.tideHeightFt,rateFtPerHr:c.tideRateFtPerHr,direction:c.tideDirection,phase:null},lightPhase:null,moonMarks:astro.moon?.periods??[],topSpecies:xs.slice(0,3).map(x=>({speciesId:matching.find(m=>m.slots.includes(x))?.speciesId??null,suitability:x.suitability})),conditionLabels:[]};});timeline.push({locationId:loc.id,mode,slots:times});}
    const sourceStatus=carried.observations.filter(x=>active.some(l=>l.id===x.locationId)).map(x=>freshness(x,nowMs,x.kind));
    const missingInputs=sourceStatus.filter(x=>x.status==="unavailable"||x.stale).map(x=>({kind:x.kind,reason:x.status,locationId:carried.observations.find(o=>o.kind===x.kind)?.locationId??null,text:copy(`missing.${x.kind}`,`${x.label} unavailable or stale.`)}));
    const requiredObs=carried.observations.filter(x=>["hourlyForecast","gridForecast","alerts","tidePredictions","waves","waterTemperature","pressureObservations","waveForecast"].includes(x.kind));
    const candidatePredictions=list.map(x=>compactSpeciesPrediction(x,x.window,x.detailsRef));
    const run=createPredictionRun({schemaVersion:{...SCHEMA_VERSION},id:runId,modelVersion:MODEL_VERSION,paramsHash,historyHash,inputsHash,catalogHash,codeRevision,horizon,targetDate,generatedAt:utc(nowMs),validFrom:utc(modeSlotsStart(horizonSlots[horizon],nowMs)),validTo:utc(modeSlotsEnd(horizonSlots[horizon],nowMs)),region:"First Coast",status:!sourceStatus.length||sourceStatus.every(x=>x.status==="unavailable")?"degraded":missingInputs.length?"partial":"ok",carriedForward:carried.carried.length>0,missingInputs,recommendation,scopeViews:{best:{recommendationId:recommendation.id},byLocation,bySpecies},locations:active.map(l=>({id:l.id,name:l.name,area:l.area,county:l.county,active:true,modes:l.modes,structure:l.structure,lat:l.lat,lon:l.lon,tideDistanceMi:l.tideDistanceMi})),bySpecies,candidates:candidatePredictions,slots:timeline,days:[],inputs:{sourceStatus,observations:requiredObs,priorSelection:sameDatePrior?{runId:sameDatePrior.id,recommendationId:sameDatePrior.recommendation?.id??null,targetDate}:null},notes:catalogWarnings,detailsRefs:Object.keys(details).filter(k=>k.startsWith(`details/${horizon}-`))});
    runs[horizon]=run;
  }
  runs.today.days=planner(nowMs,runs.today,runs.tomorrow,history,active,carried.observations,params);
  runs.tomorrow.days=runs.today.days.map(x=>x.date===tomorrowDate?{...x,kind:"forecast"}:{...x});
  const tier={GO:2,MAYBE:1,SKIP:0}, delta=runs.tomorrow.recommendation.suitability-runs.today.recommendation.suitability;
  runs.today.recommendation.comparison={kind:tier[runs.tomorrow.recommendation.verdict]>tier[runs.today.recommendation.verdict]||delta>params.selection.similarSuitabilityDelta?"worse":tier[runs.tomorrow.recommendation.verdict]<tier[runs.today.recommendation.verdict]||delta< -params.selection.similarSuitabilityDelta?"better":"similar",horizon:"tomorrow"};
  runs.tomorrow.recommendation.comparison={kind:tier[runs.tomorrow.recommendation.verdict]>tier[runs.today.recommendation.verdict]||delta>params.selection.similarSuitabilityDelta?"better":tier[runs.tomorrow.recommendation.verdict]<tier[runs.today.recommendation.verdict]||delta< -params.selection.similarSuitabilityDelta?"worse":"similar",horizon:"today"};
  for(const run of Object.values(runs))validatePredictionRun(run);
  return {today:runs.today,tomorrow:runs.tomorrow,details:Object.fromEntries(Object.entries(details).map(([k,v])=>[k,{...v,rows:v.rows.sort((a,b)=>a.speciesId.localeCompare(b.speciesId))}]))};
}
function modeSlotsStart(slots, now){return slots.length?Date.parse(slots[0]):now;}
function modeSlotsEnd(slots, now){return slots.length?Date.parse(slots.at(-1))+SLOT_MS:now+SLOT_MS;}
