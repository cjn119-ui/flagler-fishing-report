import { MODEL_PARAMS } from "./params.js";
import { getAstronomy } from "./astro.js";

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const copy=(code,text,params={})=>({code,params,text});
const FACTORS=[
  ["season","Season","season"],["waterTemp","Water temperature","water"],["tide","Tide","tide"],["light","Light","light"],["wind","Wind","wind"],["waves","Surf","surf"],["pressure","Pressure","pressure"],["solunar","Solunar","moon"],["rain","Rain","weather"],
];
const WEIGHT_KEY=Object.freeze({waterTemp:"water"});
export const weightKeyFor=k=>WEIGHT_KEY[k]??k;
const has=n=>typeof n==="number"&&Number.isFinite(n);
export function trapezoidFit(value,[min,idealLow,idealHigh,max]){
  if(!has(value)||![min,idealLow,idealHigh,max].every(has)||!(min<=idealLow&&idealLow<=idealHigh&&idealHigh<=max))return null;
  if(value<min||value>max)return 0;if(value>=idealLow&&value<=idealHigh)return 1;
  if(value<idealLow)return idealLow===min?1:(value-min)/(idealLow-min);
  return max===idealHigh?1:(max-value)/(max-idealHigh);
}
function tideScore(species,c,params){
  if(!has(c.tideRateFtPerHr))return null;
  const scale=params.factors.tide.rateNormalizationScale;
  if(!has(scale)||scale<=0)return null;
  const moving=clamp(Math.abs(c.tideRateFtPerHr)/scale);
  if(species.tide==="any")return params.factors.tide.anyDirectionScore;
  if(species.tide==="moving")return moving;
  if(moving===0)return 0.35;
  const direction=c.tideDirection ?? (c.tidePhase==="incoming"?"incoming":c.tidePhase==="outgoing"?"outgoing":c.tideRateFtPerHr>0?"incoming":c.tideRateFtPerHr<0?"outgoing":null);
  if(!direction)return null;
  return direction===species.tide?moving:Math.max(params.factors.tide.oppositeDirectionFloor,moving*params.factors.tide.oppositeDirectionFloor);
}
function getLightScore(species,c,at,astro,params){
  if(species.light==="any")return params.factors.light.anyScore;
  const time=Date.parse(at); if(!Number.isFinite(time)||!astro?.sun)return null;
  const rise=Date.parse(astro.sun.sunrise),set=Date.parse(astro.sun.sunset);
  if(!Number.isFinite(rise)||!Number.isFinite(set))return null;
  const daylight=time>=rise&&time<set;
  if(species.light==="day")return daylight?params.factors.light.dayScore:params.factors.light.nightDaySpeciesScore;
  if(species.light!=="lowlight")return null;
  const near=Math.min(Math.abs(time-rise),Math.abs(time-set));
  if(near<=params.factors.light.lowlightMinutes*60000)return 1;
  if(daylight){const mid=(rise+set)/2, half=(set-rise)/2, dist=Math.abs(time-mid)/half, lowlightFraction=params.factors.light.lowlightMinutes*60000/half;return params.factors.light.middayScore+(1-params.factors.light.middayScore)*clamp((dist-lowlightFraction)/(1-lowlightFraction));}
  return params.factors.light.nightScore;
}
function windScore(species,mode,c,spot,params){
  if(!has(c.windMph))return null;
  const p=params.factors.wind;
  let score=c.windMph<=p.fullScoreMaxMph?1:clamp(1-(c.windMph-p.fullScoreMaxMph)/(p.zeroScoreMph-p.fullScoreMaxMph));
  if(has(c.windGustMph)&&c.windGustMph>p.gustZeroMph)score=0;
  const dir=c.windDirectionDeg??c.windDirection, facing=spot?.windExposure?.facingDeg;
  if(has(dir)&&has(facing)){
    const delta=Math.abs(((dir-facing+540)%360)-180), onshore=delta<=p.onshoreSectorHalfWidthDeg;
    if(mode==="inshore"){if(onshore)score-=p.inshoreOnshorePenalty;}
    else if(onshore)score+=species.surf==="rough"?p.onshoreRoughBonus:-p.onshoreCalmPenalty;
    else if(species.surf==="calm")score+=p.offshoreCalmBonus;
  }
  return clamp(score);
}
function waveScore(species,c,params){
  if(!has(c.waveHeightM))return null;
  const p=params.factors.waves;if(c.waveHeightM>p.zeroScoreAboveM)return 0;
  const cls=c.waveHeightM<p.calmMaxM?"calm":c.waveHeightM<=p.moderateMaxM?"moderate":"rough";
  const match=species.surf;if(!match)return p.noPreferenceScore;if(match===cls)return 1;
  return (match==="calm"&&cls==="rough")||(match==="rough"&&cls==="calm")?p.oppositeClassScore:p.adjacentClassScore;
}
function solunarScore(c,at,astro,params){
  if(!astro)return null;
  const time=Date.parse(at);if(!Number.isFinite(time))return null;
  const near=period=>time>=Date.parse(period.start)&&time<=Date.parse(period.end);
  let s=astro.solunar.major.some(near)?params.factors.solunar.majorScore:astro.solunar.minor.some(near)?params.factors.solunar.minorScore:params.factors.solunar.neutralScore;
  const nearPhase=params.factors.solunar.phaseDays/params.factors.solunar.synodicDays;
  if(astro.moon.phase<nearPhase||astro.moon.phase>1-nearPhase||Math.abs(astro.moon.phase-.5)<nearPhase)s=Math.min(1,s+params.factors.solunar.phaseBoost);
  return s;
}
function scoreFor(key,species,mode,c,at,timing,spot,astro,params){
  switch(key){
    case "season":return timing?.seasonAvailable?timing.seasonScore:null;
    case "waterTemp":return trapezoidFit(c.waterTempF,species.waterF);
    case "tide":return tideScore(species,c,params);
    case "light":return getLightScore(species,c,at,astro,params);
    case "wind":return windScore(species,mode,c,spot,params);
    case "waves":return mode==="inshore"?null:waveScore(species,c,params);
    case "pressure":if(!has(c.pressureChange6hHpa))return null;{const x=c.pressureChange6hHpa;const p=params.factors.pressure;if(Math.abs(x)>p.risingMaxHpa)return p.rapidChangeScore;if(x>=p.fallingMinHpa&&x<=p.fallingMaxHpa)return p.fallingScore;if(Math.abs(x)<=p.neutralAbsMaxHpa)return p.neutralScore;return p.risingScore;}
    case "solunar":return solunarScore(c,at,astro,params);
    case "rain":return has(c.rainPct)?1-clamp(c.rainPct,0,100)/100:null;
    default:return null;
  }
}
function seasonDetail(score,mode,params){
  if(!has(score))return "Season history is unavailable.";
  if(score>=params.factors.effectHelpsMin)return mode==="inshore"?"Better inshore month":"Better month";
  if(score>=params.factors.effectNeutralMin)return "Average month";
  return "Off-season";
}
/** Build all nine factors and a renormalized weighted suitability in [0,100]. */
export function calculateFactors({species,mode,conditions={},at=conditions.at,history,historyTiming,spot,astronomy,params=MODEL_PARAMS}){
  const timing=historyTiming??history;
  const localDate=at?new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(at)):null;
  const astro=astronomy??(has(spot?.lat)&&has(spot?.lon)&&localDate?getAstronomy(localDate,spot.lat,spot.lon):null);
  const weights=params.weightsByMode[mode]; if(!weights)throw new TypeError(`Unsupported mode: ${mode}`);
  const factors=FACTORS.map(([key,label,group])=>{
    const score0=scoreFor(key,species,mode,conditions,at,timing,spot,astro,params),available=has(score0),sens=key==="tide"?(params.factors.tideSensitivityMultipliers[spot?.tideSensitivity??"medium"]??1):1;
    const base=weights[weightKeyFor(key)],adjusted=base==null?null:base*sens;
    const detail=mode==="inshore"&&key==="season"?copy(available?"season.factorQualitative":"missing.season",available?seasonDetail(score0,mode,params):"Season history is unavailable.",{seasonBasis:timing?.seasonBasis??null}):null;
    return {key,label,group,value:key==="season"?timing?.historicalRate?.rate??null:key==="waterTemp"?conditions.waterTempF:key==="tide"?conditions.tideRateFtPerHr:key==="wind"?conditions.windMph:key==="waves"?conditions.waveHeightM:key==="pressure"?conditions.pressureChange6hHpa:key==="rain"?conditions.rainPct:key==="light"?at:key==="solunar"?astro?.moon?.phase??null:null,
      unit:{season:"rate ratio",waterTemp:"°F",tide:"ft/hr",light:null,wind:"mph",waves:"m",pressure:"hPa/6h",solunar:null,rain:"%"}[key],score:available?clamp(score0):null,weight:null,contribution:null,effect:available?(score0>=params.factors.effectHelpsMin?"helps":score0>=params.factors.effectNeutralMin?"neutral":"hurts"):null,
      humanLabel:copy(available?`factor.${key}`:`missing.${key}`,available?label:`${label} unavailable`),summary:copy(available?`factor.${key}`:`missing.${key}`,available?`${label} conditions contribute to fit.`:`${label} input unavailable.`),detail:key==="season"&&mode==="inshore"?detail:copy(available?`factor.${key}`:`missing.${key}`,available?`${label} score ${Math.round(score0*100)}%.`:`No current ${label.toLowerCase()} value is available.`),source:copy(`source.${key}`,key==="season"?"MRIP regional survey history":"Normalized observations"),available,limiting:false,adjustedWeight:available?adjusted:null};
  });
  const sum=factors.reduce((s,f)=>s+(f.available?(f.adjustedWeight??0):0),0);
  for(const f of factors)if(f.available&&sum>0){f.weight=f.adjustedWeight/sum;f.contribution=f.score*f.weight;}
  const low=factors.filter(f=>f.available).sort((a,b)=>a.score-b.score)[0];if(low&&low.score<params.factors.effectNeutralMin)low.limiting=true;
  const raw=factors.reduce((s,f)=>s+(f.contribution??0),0);
  return {factors:factors.map(({adjustedWeight,...f})=>f),suitability:sum>0?Math.round(raw*100):null,rawSuitability:sum>0?raw*100:null,waterFit:getWaterFit(species,conditions.waterTempF)};
}
export function getWaterFit(species,currentF){
  if(!has(currentF)||!Array.isArray(species.waterF))return {state:null,currentF:null,minF:species.waterF?.[0]??null,maxF:species.waterF?.[3]??null,idealLowF:species.waterF?.[1]??null,idealHighF:species.waterF?.[2]??null};
  const [min,lo,hi,max]=species.waterF;return {state:currentF<min?"cold":currentF>max?"hot":currentF>=lo&&currentF<=hi?"ideal":"ok",currentF,minF:min,maxF:max,idealLowF:lo,idealHighF:hi};
}
