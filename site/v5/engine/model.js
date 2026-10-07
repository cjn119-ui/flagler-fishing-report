import { MODEL_PARAMS } from "./params.js";
import { calculateFactors,getWaterFit,weightKeyFor } from "./factors.js";
import { getHistoricalTiming } from "./history.js";
import { getAstronomy } from "./astro.js";

const has=n=>typeof n==="number"&&Number.isFinite(n), clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const utc=d=>new Date(d).toISOString();
const localParts=(d)=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(d)).map(x=>[x.type,x.value]));return p;};
const localKey=d=>{const p=localParts(d);return `${p.year}-${p.month}-${p.day}`;};
const offsetAt=d=>{const p=localParts(d);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(+d/60000)*60000;};
function localInstant(day,hour,minute=0){
  const [y,m,d]=day.split("-").map(Number), wall=Date.UTC(y,m-1,d,hour,minute);
  let guess=wall-offsetAt(wall);
  for(let i=0;i<3;i++)guess=wall-offsetAt(guess);
  return guess;
}
export function generateSlots({now,horizon="today",params=MODEL_PARAMS}){
  const key=localKey(now), tomorrowKey=localKey(+new Date(`${key}T12:00:00Z`)+86400000);
  const target=horizon==="tomorrow"?tomorrowKey:key;
  let start=horizon==="tomorrow"?localInstant(target,params.windows.tomorrowStartLocalHour):+new Date(now);
  const end=localInstant(target,horizon==="tomorrow"?params.windows.tomorrowEndLocalHour:params.windows.todayEndLocalHour);
  const slotMs=params.windows.slotMinutes*60000;
  start=Math.ceil(start/slotMs)*slotMs;
  const slots=[];for(let t=start;t<end;t+=slotMs)if(localKey(t)===target)slots.push(utc(t));
  return slots;
}
export function historyBand(rate){if(!has(rate))return null;const b=MODEL_PARAMS.history.bands;return rate>=b.commonMin?"Common":rate>=b.occasionalMin?"Occasional":"Rare";}
export function classifyEligibility({species,spot,mode,rate,historyAvailable=true,params=MODEL_PARAMS}){
  if(species.bycatch)return {eligibility:"bycatch",eligibilityReason:{code:"bycatch"}};
  if(species.needsStructure&&!new Set(["pier","jetty","bridge","dock","seawall","rocks"]).has(spot.structure))return {eligibility:"no-structure",eligibilityReason:{code:"structureRequired"}};
  if(!spot.targets?.includes(species.id))return {eligibility:"off-list",eligibilityReason:{code:"notOnSpotList"}};
  if(!historyAvailable||!has(rate))return {eligibility:"rare",eligibilityReason:{code:"historyUnavailable"}};
  if(params.history.realisticFloor==null||rate<params.history.realisticFloor)return {eligibility:"rare",eligibilityReason:{code:"belowRealisticFloor"}};
  return {eligibility:"realistic",eligibilityReason:{code:"realistic"}};
}
function cReason(code,penalty,kind="live",params={}){return {code,params,text:{code,params,text:({forecastMissing:"Forecast freshness could not be verified",forecastAging:"Forecast is aging",alertsUnchecked:"Weather alerts were not checked",tideUnavailable:"Tide timing is unavailable",distantTideStation:"Tide station is far from this spot",wavesUnavailable:"Fresh wave data is unavailable",waterTempUnavailable:"Water temperature is unavailable",inshoreBuoyTemp:"Inshore temperature uses an offshore buoy",pressureUnavailable:"Pressure trend is unavailable",historyUnavailable:"Survey history is unavailable",historyThin:"Survey history sample is thin",notEnoughCurrentData:"Not enough current data is available",sourceUnavailable:"Some current data sources are unavailable."})[code]??code},penalty,kind};}
export function calculateConfidence({conditions={},mode,spot={},historyN=null,historyAvailable=true,forecastAgeHours=null,alertsChecked=false,wavesAvailable=false,tideAvailable=null,params=MODEL_PARAMS}){
  const reasons=[];
  if(!has(forecastAgeHours)||forecastAgeHours>params.freshness.forecastMaxAgeHours)reasons.push(cReason("forecastMissing",params.confidence.forecastMissingOrStale));
  else if(forecastAgeHours>=params.freshness.forecastAgingMinHours)reasons.push(cReason("forecastAging",params.confidence.forecastAging));
  if(!alertsChecked)reasons.push(cReason("alertsUnchecked",params.confidence.alertsUnchecked));
  const tideReady=tideAvailable??(has(conditions.tideRateFtPerHr)&&has(params.factors.tide.rateNormalizationScale)&&params.factors.tide.rateNormalizationScale>0);
  if(!tideReady)reasons.push(cReason("tideUnavailable",params.confidence.tideUnavailable));
  if(mode!=="inshore"&&has(spot.tideDistanceMi)&&spot.tideDistanceMi>params.freshness.distantTideStationMiles)reasons.push(cReason("distantTideStation",params.confidence.distantOceanTideStation,"structural"));
  if(mode!=="inshore"&&!wavesAvailable)reasons.push(cReason("wavesUnavailable",params.confidence.wavesUnavailable));
  if(!has(conditions.waterTempF))reasons.push(cReason("waterTempUnavailable",params.confidence.waterTempUnavailable));
  if(mode==="inshore"&&conditions.waterTempSource==="ocean-buoy")reasons.push(cReason("inshoreBuoyTemp",params.confidence.inshoreBuoyTemp,"structural"));
  if(!has(conditions.pressureChange6hHpa))reasons.push(cReason("pressureUnavailable",params.confidence.pressureUnavailable));
  if(!historyAvailable||!has(historyN)||historyN<params.history.thinMinN)reasons.push(cReason("historyUnavailable",params.history.unavailablePenalty,"structural"));
  else if(historyN<params.history.numericMinN)reasons.push(cReason("historyThin",params.history.lowSamplePenalty,"structural"));
  const confidence=clamp(params.confidence.start-reasons.reduce((s,x)=>s+x.penalty,0),params.confidence.minimum,100);
  return {confidence,confidenceLevel:confidence>=params.thresholds.highConfidenceMin?"High":confidence>=params.thresholds.moderateConfidenceMin?"Moderate":"Low",confidenceReasons:reasons,amberQualifier:confidence>=50?reasons.find(x=>x.kind==="live")?.text??null:null};
}
export function safetyGates(c,{mode="surf",params=MODEL_PARAMS}={}){
  const out=[];const add=(code,text)=>out.push({code,text:{code,params:{},text},startsAt:c.validFrom??null,endsAt:c.validTo??null,severity:"safety"});
  if(c.thunder===true)add("thunder","Thunderstorms are expected during this window.");
  if((has(c.windMph)&&c.windMph>=params.factors.safety.windSkipMph)||(has(c.windGustMph)&&c.windGustMph>=params.factors.safety.gustSkipMph))add("wind","Wind reaches unsafe levels during this window.");
  const rank={Minor:0,Moderate:1,Severe:2,Extreme:3}, from=Date.parse(c.validFrom??""), to=Date.parse(c.validTo??"");
  const covers=a=>{const start=Date.parse(a.effective??a.onset??a.startsAt??""),end=Date.parse(a.ends??a.expires??a.validTo??"");return (!Number.isFinite(start)||!Number.isFinite(to)||start<to)&&(!Number.isFinite(end)||!Number.isFinite(from)||end>from);};
  if(c.alerts?.some(a=>(params.factors.alertGates??[]).some(g=>g.events.includes(a.event)&&rank[a.severity]>=rank[g.minimumSeverity]&&covers(a))))add("warning","An active severe weather or marine alert covers this window.");
  if(mode!=="inshore"&&has(c.waveHeightM)&&c.waveHeightM>params.factors.waves.safetySkipAboveM)add("waves","Surf reaches unsafe levels during this window.");
  return out;
}
export function seasonalBenchmarkFor({locationId,mode,date,params=MODEL_PARAMS}){
  const day=typeof date==="string"&&/^\d{4}-\d\d-\d\d$/.test(date)?date.slice(5):has(Date.parse(date))?localParts(Date.parse(date)).month+"-"+localParts(Date.parse(date)).day:null;
  if(!day)return null;
  const key=`${locationId}:${mode}`,value=params.benchmarks?.goSeasonal?.[key]?.[day];
  return has(value)?value:null;
}
export function verdictFor({suitability,confidence,eligibility,conditionsReady=true,gates=[],locationId,mode,date,params=MODEL_PARAMS}){
  if(gates.length)return "SKIP";
  const decent=has(suitability)&&suitability>=params.thresholds.maybeSuitabilityMin;
  const benchmark=seasonalBenchmarkFor({locationId,mode,date,params});
  if(decent&&eligibility==="realistic"&&conditionsReady&&has(params.thresholds.goSuitabilityMin)&&has(params.thresholds.goBenchmarkMargin)&&has(benchmark)&&suitability>=params.thresholds.goSuitabilityMin&&suitability>=benchmark+params.thresholds.goBenchmarkMargin&&confidence>=params.thresholds.goConfidenceMin)return "GO";
  return decent?"MAYBE":"SKIP";
}
const slotScore=x=>has(x?.rawSuitability)?x.rawSuitability:x?.suitability;
function duration(a,b){return (Date.parse(b)-Date.parse(a))/60000;}
const inclusiveDuration=(a,b,slotMinutes)=>((b-a+1)*slotMinutes);
function partOfDay(start,end,spot,params){
  const mid=(Date.parse(start)+Date.parse(end))/2,p=localParts(mid),minute=Number(p.hour)*60+Number(p.minute);
  if(has(spot?.lat)&&has(spot?.lon)){
    const astro=getAstronomy(localKey(mid),spot.lat,spot.lon).sun,rise=Date.parse(astro.sunrise),set=Date.parse(astro.sunset);
    if(Math.abs(mid-rise)<=params.factors.light.lowlightMinutes*60000)return "dawn";if(Math.abs(mid-set)<=params.factors.light.lowlightMinutes*60000)return "dusk";
  }
  if(minute<params.windows.middayStartLocalHour*60)return "morning";if(minute<params.windows.afternoonStartLocalHour*60)return "midday";if(minute<params.windows.eveningStartLocalHour*60)return "afternoon";return "evening";
}
function localPeakIndices(rows,slotMinutes){
  const peaks=[];let start=0;
  const contiguous=(a,b)=>Date.parse(rows[b].at)-Date.parse(rows[a].at)===slotMinutes*60000;
  while(start<rows.length){let end=start;while(end+1<rows.length&&contiguous(end,end+1)&&slotScore(rows[end+1])===slotScore(rows[start]))end++;
    const value=slotScore(rows[start]),before=start>0&&contiguous(start-1,start)?slotScore(rows[start-1]):-Infinity,after=end+1<rows.length&&contiguous(end,end+1)?slotScore(rows[end+1]):-Infinity;
    if(has(value)&&value>=before&&value>=after)peaks.push(Math.floor((start+end)/2));start=end+1;
  }
  return peaks;
}
export function findSpeciesWindows(rows,{params=MODEL_PARAMS,locationId,mode,speciesId,spot=null,now=rows[0]?.at}={}){
  const ordered=[...rows].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),slotMs=params.windows.slotMinutes*60000,contiguous=(a,b)=>Date.parse(ordered[b].at)-Date.parse(ordered[a].at)===slotMs,peaks=localPeakIndices(ordered,params.windows.slotMinutes), candidates=[];
  for(const pi of peaks){const peak=ordered[pi], floor=slotScore(peak)-params.windows.peakTolerancePoints;let lo=pi,hi=pi;
    while(lo>0&&contiguous(lo-1,lo)&&localKey(ordered[lo-1].at)===localKey(peak.at)&&has(slotScore(ordered[lo-1]))&&slotScore(ordered[lo-1])>=floor&&inclusiveDuration(lo-1,hi,params.windows.slotMinutes)<=params.windows.maximumMinutes)lo--;
    while(hi<ordered.length-1&&contiguous(hi,hi+1)&&localKey(ordered[hi+1].at)===localKey(peak.at)&&has(slotScore(ordered[hi+1]))&&slotScore(ordered[hi+1])>=floor&&inclusiveDuration(lo,hi+1,params.windows.slotMinutes)<=params.windows.maximumMinutes)hi++;
    while(inclusiveDuration(lo,hi,params.windows.slotMinutes)<params.windows.minimumMinutes){const left=lo>0&&contiguous(lo-1,lo)&&localKey(ordered[lo-1].at)===localKey(peak.at)?ordered[lo-1]:null,right=hi<ordered.length-1&&contiguous(hi,hi+1)&&localKey(ordered[hi+1].at)===localKey(peak.at)?ordered[hi+1]:null;if(!left&&!right)break;if(right&&(!left||slotScore(right)>=slotScore(left)))hi++;else lo--;}
    if(inclusiveDuration(lo,hi,params.windows.slotMinutes)<params.windows.minimumMinutes)continue;
    // Select best mean slice <=150 minutes containing peak.
    let best=null;for(let a=lo;a<=pi;a++){for(let b=pi;b<=hi;b++){if(inclusiveDuration(a,b,params.windows.slotMinutes)>params.windows.maximumMinutes)break;if(inclusiveDuration(a,b,params.windows.slotMinutes)<params.windows.minimumMinutes)continue;const part=ordered.slice(a,b+1);if(part.some((x,i)=>i>0&&!contiguous(a+i-1,a+i)))continue;const mean=part.reduce((s,x)=>s+slotScore(x),0)/part.length;if(!best||mean>best.mean||mean===best.mean&&Date.parse(part[0].at)<Date.parse(best.part[0].at))best={part,mean};}}
    if(!best)continue;const part=best.part, start=part[0].at,end=utc(Date.parse(part.at(-1).at)+params.windows.slotMinutes*60000),gates=[...new Map(part.flatMap(x=>x.gates??[]).map(x=>[x.code,x])).values()];
    const reasons=[...new Map(part.flatMap(x=>x.confidenceReasons??[]).map(x=>[x.code,x])).values()],confidence=clamp(params.confidence.start-reasons.reduce((sum,x)=>sum+(x.penalty??0),0),params.confidence.minimum,100),nowMs=Date.parse(now??start),startMs=Date.parse(start),endMs=Date.parse(end);
    candidates.push({id:`${locationId}:${mode}:${speciesId}:${start}`,speciesId,locationId,mode,start,end,partOfDay:partOfDay(start,end,spot,params),peak:peak.at,peakSuitability:Math.round(slotScore(peak)),peakRaw:slotScore(peak),mean:best.mean,suitability:Math.round(best.mean),confidence,confidenceReasons:reasons,gates,slots:part,isOpenAtGenerated:nowMs>=startMs&&nowMs<endMs,startsInMinAtGenerated:Math.max(0,Math.ceil((startMs-nowMs)/60000)),endsInMinAtGenerated:Math.max(0,Math.ceil((endMs-nowMs)/60000))});
  }
  candidates.sort((a,b)=>b.peakRaw-a.peakRaw||b.mean-a.mean||Date.parse(a.start)-Date.parse(b.start));
  for(const candidate of candidates)delete candidate.peakRaw;
  const chosen=[];for(const w of candidates){if(chosen.some(x=>Date.parse(w.start)<Date.parse(x.end)&&Date.parse(x.start)<Date.parse(w.end)))continue;chosen.push(w);if(chosen.length>=params.windows.maximumPerSpecies)break;}
  return chosen.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
export function haversineMiles(a,b){const R=3958.7613,r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r,aa=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(aa));}
export function tieCandidates(candidates,{previous=null,preferences={},params=MODEL_PARAMS,preferenceKey="default"}={}){
  candidates=candidates.filter(x=>x.eligibility==="realistic");
  if(!candidates.length)return {selected:null,tiedWith:[],selection:{reason:"switched",heldFromRunId:null,priorRecommendationId:null,preferenceKey}};
  const tier={GO:2,MAYBE:1,SKIP:0};const sorted=[...candidates].sort((a,b)=>tier[b.verdict]-tier[a.verdict]||b.suitability-a.suitability);
  const best=sorted[0], tied=sorted.filter(x=>x.verdict===best.verdict&&best.suitability-x.suitability<=params.selection.similarSuitabilityDelta);
  let selected=tied.sort((a,b)=>Number(!!preferences.favourites?.includes(b.locationId))-Number(!!preferences.favourites?.includes(a.locationId))||Number(b.onTargetList)-Number(a.onTargetList)||(a.catalogOrder??0)-(b.catalogOrder??0))[0],reason=tied.length>1?"tie":"switched",heldFromRunId=null;
  if(previous&&previous.targetDate===best.targetDate&&previous.scopeKey===best.scopeKey&&previous.focusKey===best.focusKey&&(previous.preferenceKey??"default")===preferenceKey){const prior=tied.find(x=>x.locationId===previous.locationId&&x.mode===previous.mode);if(prior){selected=prior;reason="held";heldFromRunId=previous.runId??null;}else if(previous.verdict&&tier[best.verdict]>tier[previous.verdict]||previous.locationId===best.locationId&&previous.mode===best.mode&&best.suitability-(previous.suitability??0)>params.selection.heldSelectionDelta)reason="switched";}
  return {selected,tiedWith:tied.filter(x=>x!==selected).map(x=>x.id),selection:{reason,heldFromRunId,priorRecommendationId:reason==="held"?previous.recommendationId??null:null,preferenceKey}};
}
function waterOutside(species,temp){return has(temp)&&Array.isArray(species.waterF)&&(temp<species.waterF[0]||temp>species.waterF[3]);}
/** Score every slot for one species, then aggregate per-species windows. */
export function scoreSpecies({species,spot,mode,history,slots,conditionsAt,now,horizon="today",forecastAgeHours=null,alertsChecked=false,waveCoverage=()=>false,params=MODEL_PARAMS}){
  if(!species?.modes?.includes(mode))return null;
  const timing=history?getHistoricalTiming(history,{speciesId:species.id,speciesName:species.name,mripAliases:species.mrip,mode,start:slots[0]??now,end:utc(Date.parse(slots[0]??now)+1),waterF:species.waterF}):null;
  const histRate=timing?.historicalRate?.rate??null, currentHistoryAvailable=timing?.historyAvailable===true, astronomyByDate=new Map(), eligibility=classifyEligibility({species,spot,mode,rate:histRate,historyAvailable:currentHistoryAvailable,params});
  const scored=(slots??[]).map(at=>{const sourceConditions=conditionsAt(at),wavesOk=mode==="inshore"||waveCoverage(at,horizon,{mode,spot})===true,c=mode!=="inshore"&&!wavesOk?{...sourceConditions,waveHeightM:null}:sourceConditions,ht=timing?{...timing,waterFit:getWaterFit(species,c.waterTempF)}:null,astroDate=localKey(at);let astronomy=astronomyByDate.get(astroDate);if(!astronomy&&has(spot.lat)&&has(spot.lon)){astronomy=getAstronomy(astroDate,spot.lat,spot.lon);astronomyByDate.set(astroDate,astronomy);}const f=calculateFactors({species,mode,conditions:c,at,historyTiming:ht,spot,astronomy,params});
    const cap=[];if(waterOutside(species,c.waterTempF))cap.push({code:"waterOutsideRange",params:{waterTempF:c.waterTempF,range:species.waterF}});if(ht?.seasonAvailable&&ht.seasonScore<params.history.seasonCapBelow)cap.push({code:"outOfSeason",params:{relativeSeason:ht.seasonScore}});if(eligibility.eligibility!=="realistic")cap.push({code:"notRealistic",params:{eligibility:eligibility.eligibility,reason:eligibility.eligibilityReason.code}});
    let rawSuitability=f.rawSuitability;if(cap.some(x=>x.code==="waterOutsideRange"||x.code==="outOfSeason"))rawSuitability=Math.min(rawSuitability??0,params.history.seasonCapSuitability);
    const availableShare=f.factors.reduce((sum,x)=>sum+(x.available?(params.weightsByMode[mode][weightKeyFor(x.key)]??0):0),0),critical=mode==="inshore"?["wind","rain"]:["wind","rain","waves"],allCriticalMissing=critical.every(key=>!f.factors.find(x=>x.key===key)?.available),cp=params.factors.conditionCaps,score=key=>f.factors.find(x=>x.key===key)?.score;
    const onshore=has(c.windDirectionDeg)&&has(spot?.windExposure?.facingDeg)&&Math.abs(((c.windDirectionDeg-spot.windExposure.facingDeg+540)%360)-180)<=params.factors.wind.onshoreSectorHalfWidthDeg;
    const severeCondition=(has(score("wind"))&&score("wind")<cp.sinkBelow)||(mode!=="inshore"&&has(score("waves"))&&score("waves")<cp.sinkBelow)||(has(score("rain"))&&score("rain")<cp.sinkBelow)||(has(c.rainPct)&&c.rainPct>=cp.rainProbabilityPct)||(has(c.thunderPct)&&c.thunderPct>=cp.thunderProbabilityPct)||(mode!=="inshore"&&has(c.waveHeightM)&&c.waveHeightM>cp.waveHeightM)||(onshore&&has(c.windMph)&&c.windMph>=cp.onshoreWindMph)||(has(c.windGustMph)&&c.windGustMph>=cp.windGustMph);
    const insufficientData=availableShare<params.factors.minimumAvailableWeightShare||allCriticalMissing;
    if(insufficientData){cap.push({code:"notEnoughCurrentData",params:{availableWeightShare:availableShare}});rawSuitability=Math.min(rawSuitability??100,cp.suitabilityCap);}
    if(severeCondition){cap.push({code:"severeConditions",params:{}});rawSuitability=Math.min(rawSuitability??100,cp.suitabilityCap);}
    const suitability=has(rawSuitability)?Math.round(rawSuitability):null;
    let conf=calculateConfidence({conditions:c,mode,spot,historyN:ht?.historicalRate?.n,historyAvailable:ht?.historyAvailable===true,forecastAgeHours,alertsChecked,wavesAvailable:wavesOk,tideAvailable:f.factors.find(x=>x.key==="tide")?.available===true,params});
    if(insufficientData)conf={...conf,confidence:Math.min(49,conf.confidence),confidenceLevel:"Low",confidenceReasons:[...conf.confidenceReasons,cReason("notEnoughCurrentData",60,"live")],amberQualifier:null};
    const gates=safetyGates(c,{mode,params});
    const safetyInputsReady=has(c.windMph)&&has(c.windGustMph)&&typeof c.thunder==="boolean";
    const conditionsReady=has(f.suitability)&&!insufficientData&&safetyInputsReady&&forecastAgeHours!=null&&forecastAgeHours<=params.freshness.forecastMaxAgeHours&&alertsChecked&&(mode==="inshore"||wavesOk);
    const date=localKey(at),benchmark=seasonalBenchmarkFor({locationId:spot.id,mode,date,params});
    if(benchmark===null&&!gates.length)cap.push({code:"benchmarkUnavailable",params:{locationId:spot.id,mode,date}});
    const verdict=verdictFor({suitability,confidence:conf.confidence,eligibility:eligibility.eligibility,conditionsReady,gates,locationId:spot.id,mode,date,params});
    return {at,conditionsReady,suitability,rawSuitability,benchmark,factors:f.factors,waterFit:f.waterFit,historyTiming:ht,eligibility:eligibility.eligibility,eligibilityReason:eligibility.eligibilityReason,caps:cap,confidence:conf.confidence,confidenceLevel:conf.confidenceLevel,confidenceReasons:conf.confidenceReasons,amberQualifier:conf.amberQualifier,gates,verdict,conditions:c};});
  const windows=findSpeciesWindows(scored,{params,locationId:spot.id,mode,speciesId:species.id,spot,now}).map(w=>{
    const gates=[...new Map(w.slots.flatMap(x=>x.gates??[]).map(x=>[x.code,x])).values()];
    const ready=w.slots.every(x=>x.conditionsReady===true);
    const date=localKey(w.start),benchmark=seasonalBenchmarkFor({locationId:spot.id,mode,date,params});
    if(benchmark===null&&!gates.length&&!w.slots.some(x=>x.caps?.some(c=>c.code==="benchmarkUnavailable")))w.slots[0]?.caps?.push({code:"benchmarkUnavailable",params:{locationId:spot.id,mode,date}});
    const v=verdictFor({suitability:w.suitability,confidence:w.confidence,eligibility:eligibility.eligibility,conditionsReady:ready,gates,locationId:spot.id,mode,date,params});
    const caps=[...new Map(w.slots.flatMap(x=>x.caps??[]).map(x=>[x.code,x])).values()];
    const confidenceLevel=w.confidence>=params.thresholds.highConfidenceMin?"High":w.confidence>=params.thresholds.moderateConfidenceMin?"Moderate":"Low";
    const amberQualifier=w.confidence>=params.thresholds.moderateConfidenceMin?w.confidenceReasons.find(x=>x.kind==="live")?.text??null:null;
    if(benchmark===null&&!gates.length&&!caps.some(x=>x.code==="benchmarkUnavailable"))caps.push({code:"benchmarkUnavailable",params:{locationId:spot.id,mode,date}});
    return {...w,gates,benchmark,verdict:v,caps,confidenceLevel,amberQualifier};
  });
  return {speciesId:species.id,locationId:spot.id,mode,eligibility:eligibility.eligibility,eligibilityReason:eligibility.eligibilityReason,historicalRate:timing?.historicalRate??null,seasonCurve:timing?.seasonCurve??Array(12).fill(null),waterFit:scored[0]?.waterFit??null,seasonBasis:timing?.seasonBasis??null,seasonAbsoluteReference:timing?.seasonAbsoluteReference??null,seasonReferenceFallback:timing?.seasonReferenceFallback??true,historyNotes:timing?.historyNotes??[],slots:scored,windows};
}
/** Candidate selector for a set of per-species best windows; applies tie/prior rules. */
export function selectDriver(candidates,options={}){return tieCandidates(candidates,options);}

const waterType=mode=>mode==="inshore"?"inshore":"ocean";
const acceptableBackup=x=>x.eligibility==="realistic"&&(x.verdict==="GO"||x.verdict==="MAYBE");
/** Apply owner-approved backup tiers and the strict 7-mile straight-line radius. */
export function chooseBackup(primary,candidates,{focusSpeciesId=null,params=MODEL_PARAMS}={}){
  const hasSafetyGate=(primary.gates??[]).some(x=>x.severity==="safety"||["thunder","wind","warning","waves"].includes(x.code));
  const eligible=candidates.filter(x=>x.id!==primary.id&&acceptableBackup(x)&&(x.suitability??0)>=(primary.suitability??0)-5&&!(primary.mode==="surf"&&x.mode==="pier")&&(x.speciesId===primary.speciesId||focusSpeciesId&&!hasSafetyGate));
  const distance=x=>has(x.distanceMi)?x.distanceMi:primary.spot&&x.spot?haversineMiles(primary.spot,x.spot):null;
  const nearby=eligible.filter(x=>distance(x)!=null&&distance(x)<=params.selection.backupNearbyMiles);
  const later=eligible.filter(x=>x.locationId===primary.locationId&&x.mode===primary.mode&&Date.parse(x.start)>Date.parse(primary.end));
  const tiers=[
    nearby.filter(x=>waterType(x.mode)!==waterType(primary.mode)),
    later,
    nearby.filter(x=>waterType(x.mode)===waterType(primary.mode)&&x.locationId!==primary.locationId),
    eligible,
  ];
  for(let i=0;i<tiers.length;i++)if(tiers[i].length){const sorted=tiers[i].sort((a,b)=>({GO:1,MAYBE:0}[b.verdict]-{GO:1,MAYBE:0}[a.verdict])||(b.suitability??0)-(a.suitability??0)||(distance(a)??Infinity)-(distance(b)??Infinity));const x=sorted[0],kind=x.speciesId!==primary.speciesId?"other-species":i===0?"other-mode":i===1?"later-window":i===2?"nearby-same-water":"best-anywhere";return {kind,id:x.id,locationId:x.locationId,mode:x.mode,speciesId:x.speciesId,verdict:x.verdict,distanceMi:distance(x),area:x.area??null,reason:x.reason??(kind==="later-window"?"A later window at this spot has a similar fit.":kind==="other-mode"?"A nearby spot in another mode has a similar fit.":"A nearby alternative has a similar fit.")};}
  return null;
}
/** Keep driver first; rank the remaining target candidates by suitability. */
export function orderTargets(driver,targets,{limit=MODEL_PARAMS.selection.maxTargets}={}){
  const pool=[driver,...targets].filter(x=>x&&x.eligibility==="realistic"&&(x.suitability??0)>=MODEL_PARAMS.thresholds.maybeSuitabilityMin),safeDriver=pool.includes(driver)?driver:null;
  const ordered=safeDriver?[safeDriver,...pool.filter(x=>x!==safeDriver&&x.speciesId!==safeDriver.speciesId).sort((a,b)=>(b.suitability??0)-(a.suitability??0))]:pool.sort((a,b)=>(b.suitability??0)-(a.suitability??0));
  return ordered.slice(0,Math.max(limit,1)).map(x=>({...x,rareTag:x.historicalRate?.band==="Rare"}));
}
