import { MODEL_PARAMS } from "./params.js";

const HISTORY_PATH = "./data/first-coast-history.json";
const MODE_BUCKET = Object.freeze({ surf: "ocean", pier: "ocean", inshore: "inland" });
const sourceLabel = mode => mode === "inshore" ? "river, bridge and bank surveys" : "pier and beach surveys";
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const finite = n => typeof n === "number" && Number.isFinite(n);
const copy = (code,text,params={}) => ({code,params,text});
const sliceFor = (history, mode, month) => history?.[MODE_BUCKET[mode]]?.by_month?.[String(month)] ?? null;
const aliasesFor = (slice, speciesId, aliases=[]) => {
  const direct = slice?.target_species?.[speciesId];
  if (direct && finite(direct.hitTrips) && finite(direct.nTrips)) return { hitTrips: direct.hitTrips, nTrips: direct.nTrips };
  // Alias unions are materialized by the repaired builder as target_species[speciesId].
  // Summing raw alias rows here could count the same interview more than once.
  return null;
};
function integerCounts(slice, speciesId, aliases) {
  const row = aliasesFor(slice, speciesId, aliases);
  const n = slice?.nTrips ?? slice?.n;
  if (!row || !finite(n) || n <= 0 || row.nTrips !== n || row.hitTrips < 0 || row.hitTrips > n) return null;
  return { h: row.hitTrips, n };
}
function bandFor(rate) {
  if (rate == null) return null;
  if (rate >= MODEL_PARAMS.history.bands.commonMin) return "Common";
  if (rate >= MODEL_PARAMS.history.bands.occasionalMin) return "Occasional";
  return "Rare";
}

/** Derive the absolute season-rate yardstick from the frozen history bucket totals. */
export function absoluteReference(history, mode) {
  const cap=MODEL_PARAMS.history.seasonAbsoluteRateCap, bucket=MODE_BUCKET[mode];
  const inland=history?.inland?.all, ocean=history?.ocean?.all;
  const inlandAny=inland?.personalAnyCatchTrips, inlandN=inland?.nTrips??inland?.n;
  const oceanAny=ocean?.personalAnyCatchTrips, oceanN=ocean?.nTrips??ocean?.n;
  const valid=[inlandAny,inlandN,oceanAny,oceanN].every(finite)&&inlandAny>0&&inlandN>0&&oceanAny>0&&oceanN>0&&inlandAny<=inlandN&&oceanAny<=oceanN;
  if(bucket==="ocean")return {reference:cap,fallback:!valid};
  if(bucket!=="inland"||!valid)return {reference:cap,fallback:true};
  return {reference:cap*(inlandAny/inlandN)/(oceanAny/oceanN),fallback:false};
}

/** Read and validate the immutable, repaired history artifact. */
export function normalizeFirstCoastHistory(value) {
  if (!value || !value.ocean?.by_month || !value.inland?.by_month || !value.water_temp?.by_day_of_year) throw new TypeError("Invalid first-coast history schema");
  const normalizeSlice = slice => {
    if (!slice) return null;
    const n = slice.nTrips ?? slice.n;
    return { ...slice, n, nTrips:n, target_species:slice.target_species ?? {} };
  };
  const normalizeBucket = bucket => ({ ...bucket, all:normalizeSlice(bucket.all), by_month:Object.fromEntries(Object.entries(bucket.by_month ?? {}).map(([m,x])=>[m,normalizeSlice(x)])) });
  return { ...value, ocean:normalizeBucket(value.ocean), inland:normalizeBucket(value.inland), normalized:true };
}

export async function loadFirstCoastHistory({ readJson, path = HISTORY_PATH } = {}) {
  let value;
  if (readJson) value = await readJson(path);
  else {
    if (typeof fetch !== "function") throw new Error("loadFirstCoastHistory requires readJson or fetch");
    const response = await fetch(path);
    if (!response.ok) throw new Error(`History unavailable (${response.status})`);
    value = await response.json();
  }
  return normalizeFirstCoastHistory(value);
}

/** Raw non-proxy monthly survey rate; omitted/zero-denominator slices stay unavailable. */
export function getSpeciesMonthRate(history, { speciesId, mripAliases = [], mode, month }) {
  const slice = sliceFor(history, mode, month), counts = integerCounts(slice, speciesId, mripAliases);
  const n = slice?.nTrips ?? slice?.n ?? null;
  if (!counts) return { rate:null, n:finite(n)?n:null, lowSample:finite(n)?n<MODEL_PARAMS.history.numericMinN:false, band:null, unit:"trips", month, sourceLabel:sourceLabel(mode), hitTrips:null, available:false };
  const rate = counts.h / counts.n;
  return { rate, n:counts.n, hitTrips:counts.h, lowSample:counts.n<MODEL_PARAMS.history.numericMinN, band:bandFor(rate), unit:"trips", month, sourceLabel:sourceLabel(mode), available:true };
}

function shrunkRate(history, query, month) {
  const bucket = history?.[MODE_BUCKET[query.mode]], all = bucket?.all;
  const annual = integerCounts(all, query.speciesId, query.mripAliases);
  if (!annual) return null;
  const prev = month===1?12:month-1, next=month===12?1:month+1;
  const p = m => integerCounts(bucket?.by_month?.[String(m)], query.speciesId, query.mripAliases);
  const a=p(prev), b=p(next), cur=p(month);
  if (!a || !b || !cur) return null;
  const { kNeighbor, kMonth } = MODEL_PARAMS.history;
  const pAnnual=annual.h/annual.n;
  const neighbor=(a.h+b.h+kNeighbor*pAnnual)/(a.n+b.n+kNeighbor);
  return (cur.h+kMonth*neighbor)/(cur.n+kMonth);
}
export function getShrunkSpeciesMonthRate(history, query) {
  const rate=shrunkRate(history,query,query.month), raw=getSpeciesMonthRate(history,query);
  if (rate==null) return { ...raw, rate:null, band:null, available:false, shrunk:false };
  return { ...raw, rate, band:bandFor(rate), available:true, shrunk:true };
}
export function getSeasonCurve(history, query) {
  return Array.from({length:12},(_,i)=>shrunkRate(history,query,i+1));
}
/** Returns regionally shrunk timing and display-rate data for a UTC window. */
export function getHistoricalTiming(history, { start, end, mode, speciesId, speciesName, mripAliases=[], waterF, waterTempF }) {
  const date=new Date(start), endDate=new Date(end);
  if (!Number.isFinite(+date) || !Number.isFinite(+endDate) || +endDate<=+date) throw new TypeError("Invalid history window");
  const month=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"numeric"}).format(date)), query={speciesId,mripAliases,mode,month,waterF,waterTempF};
  const historyRate=getShrunkSpeciesMonthRate(history,query), curve=getSeasonCurve(history,{speciesId,mripAliases,mode});
  const eligiblePeaks=curve.filter((rate,i)=>{const m=getSpeciesMonthRate(history,{speciesId,mripAliases,mode,month:i+1});return finite(rate)&&m.hitTrips>=MODEL_PARAMS.history.seasonPeakMinimumHits;}), complete=curve.every(finite), peak=eligiblePeaks.length?Math.max(...eligiblePeaks):null;
  const rel=peak!==null&&finite(historyRate.rate)?historyRate.rate/peak:null,{reference:seasonAbsoluteReference,fallback:seasonReferenceFallback}=absoluteReference(history,mode),abs=historyRate.rate/seasonAbsoluteReference;
  const seasonScore=complete&&finite(historyRate.rate)?Math.max(0,Math.min(1,rel??Infinity,abs)):null,seasonBasis=rel==null?"absoluteOnly":"relativeCapped",seasonAvailable=seasonScore!==null;
  const displayName=typeof speciesName==="string"&&speciesName?speciesName:speciesId,historyNotes=[];
  if(mode==="inshore"){
    historyNotes.push(copy("history.inshoreSpread","Inshore catches in the surveys are spread over many species, so none is Common. A GO here means today's conditions line up in one of this species's better inshore months, not that most trips catch one."));
    // Do not claim the month rate is usable when a genuinely incomplete curve keeps season unavailable.
    if(seasonBasis==="absoluteOnly"&&seasonAvailable)historyNotes.push(copy("season.thinPeak",`Too few survey catches to pick ${displayName}'s best month; season uses its overall ${monthNames[month-1]} survey rate.`,{species:displayName,month:monthNames[month-1]}));
  }
  const currentF=waterTempF;
  const waterFit=Array.isArray(waterF)&&waterF.length===4?{state:!finite(currentF)?null:currentF<waterF[0]?"cold":currentF>waterF[3]?"hot":currentF>=waterF[1]&&currentF<=waterF[2]?"ideal":"ok",currentF:finite(currentF)?currentF:null,minF:waterF[0],maxF:waterF[3],idealLowF:waterF[1],idealHighF:waterF[2]}:null;
  return { historicalRate:{...historyRate,month,monthName:monthNames[month-1]}, historyAvailable:historyRate.available===true, seasonCurve:curve, seasonPeakRate:peak, seasonScore, seasonAvailable, seasonBasis, seasonAbsoluteReference, seasonReferenceFallback, historyNotes, waterFit };
}
