/** Pure, shared copy generation. Every clock-dependent result accepts an explicit `now`. */
export const REASON_COPY = Object.freeze({
  forecastUnavailable: "The forecast is unavailable.",
  wavesUnavailableToday: "Can't confirm the surf right now.",
  wavesUnavailableTomorrow: "No surf forecast for tomorrow yet.",
  historyUnavailable: "Survey history is unavailable for this fish.",
  notRealistic: "Survey history is too low to make this a realistic target.",
  bycatch: "This fish is treated as bycatch, not a target.",
  structureRequired: "This fish needs structure such as a pier, bridge, or rocks.",
  notOnSpotList: "Not usually caught at the spots we cover.",
  belowRealisticFloor: "Survey history is too low to make this a realistic target.",
  realistic: "Survey history supports this as a realistic target.",
});
const INSHORE_SPREAD_COPY=Object.freeze({code:"history.inshoreSpread",params:{},text:"Inshore catches in the surveys are spread over many species, so none is Common. A GO here means today's conditions line up in one of this species's better inshore months, not that most trips catch one."});
export const GATE_COPY = Object.freeze({
  thunder: "Thunderstorms are expected during this window.",
  wind: "Wind reaches unsafe levels during this window.",
  warning: "An active weather warning covers this window.",
  waves: "Surf reaches unsafe levels during this window.",
});
export const CONFIDENCE_COPY = Object.freeze({ High: "High confidence", Moderate: "Moderate confidence", Low: "Low confidence" });
export const FRESHNESS_COPY = Object.freeze({ current: "Current data", stale: "Data is stale", fallback: "Using a fallback source", unavailable: "Data unavailable" });

const asDate = (v) => v instanceof Date ? v : new Date(v);
const validDate = (d) => Number.isFinite(d.getTime());
const localParts = (date, timeZone="America/New_York") => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year:"numeric",month:"2-digit",day:"2-digit",hour:"numeric",minute:"2-digit",hour12:true }).formatToParts(date).map(p=>[p.type,p.value]));
const localDateKey = (date) => { const p=localParts(date);return `${p.year}-${p.month}-${p.day}`; };
const timeText = (date) => new Intl.DateTimeFormat("en-US", { timeZone:"America/New_York", hour:"numeric", minute:"2-digit" }).format(date).replace(":00", "");
const timeRangeText = (start,end) => {
  const a=timeText(start), b=timeText(end), suffixA=a.match(/\s([AP]M)$/)?.[1], suffixB=b.match(/\s([AP]M)$/)?.[1];
  return `${suffixA&&suffixA===suffixB?a.replace(/\s[AP]M$/,''):a}–${b}`;
};
const prettyPart = (value) => ({ dawn:"morning", morning:"morning", midday:"midday", afternoon:"afternoon", dusk:"evening", evening:"evening" }[value] ?? value ?? "");
const monthText = (month) => typeof month === "number" ? new Intl.DateTimeFormat("en-US",{month:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2020,month-1,1))) : String(month ?? "");

export const presentChildren = (...kids) => kids.flat().filter(k => k != null && k !== false);
export function windowPhase(win, now) {
  const start = Date.parse(win?.start), end = Date.parse(win?.end), current = +new Date(now);
  if (![start, end, current].every(Number.isFinite)) return "none";
  return end <= current ? "ended" : start <= current ? "open" : "upcoming";
}
export function scrubWindows(rec, days, { skip } = {}) {
  return [...(skip ? [] : [rec?.window]), ...(days ?? []).flatMap(d => d.windows ?? []).filter(w => w.locationId === rec?.locationId && w.mode === rec?.mode)].filter(Boolean);
}
export const slotInWindow = (at, wins) => (wins ?? []).some(w => Number.isFinite(Date.parse(w.start)) && Number.isFinite(Date.parse(w.end)) && Date.parse(at) >= Date.parse(w.start) && Date.parse(at) < Date.parse(w.end));
export const slotHeld = (at, gates) => (gates ?? []).some(g => Number.isFinite(Date.parse(g.startsAt)) && Number.isFinite(Date.parse(g.endsAt)) && Date.parse(at) >= Date.parse(g.startsAt) && Date.parse(at) < Date.parse(g.endsAt));
export const factorLine = (label, value) => value.toLowerCase().startsWith(label.toLowerCase()) ? value : `${label}: ${value}`;
export function confidenceDisplay({ level, score }, { stale }) {
  return { word: level.replace(" confidence", ""), suffix: stale ? "last known" : null, scoreNote: score == null ? null : stale ? `Score ${score} of 100 when issued` : `Score ${score} of 100` };
}
export const pickComparison = rec => rec?.comparison?.kind ?? null;
export function backupTitle(b, rec, locName, range) {
  return b.kind === "later-window" && b.locationId === rec.locationId ? `Later here · ${range}` : b.kind === "later-window" ? `${locName ?? b.locationId} · ${range}` : locName ?? b.locationId;
}

/** Resolve a coded CopyMessage with its stored fallback text. */
export function formatCopyMessage(message) {
  if (message == null) return "";
  if (typeof message === "string") return message;
  if (typeof message.text === "string" && message.text) return message.text;
  const table = message.kind === "gate" ? GATE_COPY : message.kind === "reason" ? REASON_COPY : {};
  return table[message.code] ?? String(message.code ?? "").replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/[._-]+/g," ").replace(/^./,x=>x.toUpperCase());
}
export const formatHeadline = (run, _now) => {
  const headline=formatCopyMessage(run.recommendation.headline);
  return run.recommendation.horizon==="tomorrow"?headline.replace(/\btoday\b/gi,"tomorrow"):headline;
};
export const formatUseLine = (run, _now) => formatCopyMessage(run.recommendation.useLine);
export const formatReason = (run, _now) => formatCopyMessage(run.recommendation.reason?.text ?? run.recommendation.reason);
export function formatGates(run, _now) { return (run.recommendation.gates ?? []).map(g=>formatCopyMessage(g.text ?? g)); }
export function formatConfidenceParts(run) {
  const r=run.recommendation, level=CONFIDENCE_COPY[r.confidenceLevel] ?? `${r.confidenceLevel ?? "Unknown"} confidence`;
  const score=Number.isFinite(r.confidence)?String(Math.round(r.confidence)):null;
  const summary=formatCopyMessage(r.confidenceSummary);
  const reasons=[...new Set((r.confidenceReasons??[]).map(x=>x.code==="sourceUnavailable"?"Some current data sources are unavailable.":formatCopyMessage(x.text??x)).filter(Boolean))].slice(0,3);
  return {level,score,detail:summary||reasons.join("; ")};
}
export function formatConfidence(run, _now) {
  const {level,score,detail}=formatConfidenceParts(run);
  return [level,score,detail].filter(Boolean).join(" · ");
}
const SOURCE_LABELS=Object.freeze({gridForecast:"Forecast grid",points:"NWS location lookup",hourlyForecast:"Hourly forecast",pressureObservations:"Pressure",tidePredictions:"Tide predictions",waterTemperature:"Water temperature",waveForecast:"Wave forecast",waves:"Wave buoy",alerts:"Alerts"});
export function sourceSummaries(sources, aging=false, timeLabel=(v)=>v??"") {
  const groups=new Map(),rank={current:0,fallback:1,stale:2,unavailable:3};
  for(const s of sources??[]){
    const provider=s.provider??s.source??"", key=`${s.kind??s.label??"unknown"}|${provider}`;
    const status=s.available===false||s.status==="unavailable"?"unavailable":s.stale||s.status==="stale"?"stale":s.usedFallback||s.status==="fallback"?"fallback":"current";
    const row=groups.get(key)??{kind:s.kind??s.label??"unknown",provider,status,fetchedAt:s.fetchedAt};
    if(rank[status]>rank[row.status]){row.status=status;row.fetchedAt=s.fetchedAt;}
    else if(rank[status]===rank[row.status]&&Date.parse(s.fetchedAt)>Date.parse(row.fetchedAt))row.fetchedAt=s.fetchedAt;
    groups.set(key,row);
  }
  const providerLabel=x=>({nws:"NWS","open-meteo":"Open-Meteo",ndbc:"NDBC",secoora:"SECOORA",coops:"NOAA CO-OPS"}[x]??x);
  return [...groups.values()].map(x=>({
    ...x,label:SOURCE_LABELS[x.kind]??String(x.kind).replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/^./,v=>v.toUpperCase()),
    state:x.status==="unavailable"?"Unavailable":x.status==="stale"?"Stale":x.status==="fallback"?`Fallback${x.provider?` · ${providerLabel(x.provider)}`:""}`:aging?`As of ${timeLabel(x.fetchedAt)}`:`${x.provider?`${providerLabel(x.provider)} · `:""}Current`,
  }));
}
export function nextWindowLabel(run, rec, now) {
  const current=+new Date(now);
  if(!Number.isFinite(current))return null;
  const next=(run.days??[]).flatMap(d=>d.windows??[]).filter(w=>w.locationId===rec.locationId&&w.mode===rec.mode&&Number.isFinite(Date.parse(w.start))&&Date.parse(w.start)>current).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0];
  if(!next)return null;
  const start=new Date(next.start),today=localDateKey(new Date(current)),tomorrow=localDateKey(new Date(current+86400000)),date=localDateKey(start);
  const day=date===today?"":date===tomorrow?"Tomorrow":new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"long"}).format(start);
  return `Next window ${day?`${day} `:""}${timeText(start)}`;
}
export function slotIndexAt(slots, now) {
  const t=+new Date(now), times=(slots??[]).map(x=>Date.parse(x.at));
  if(!Number.isFinite(t)||!times.length||t<times[0])return -1;
  const step=times.length>1?times[1]-times[0]:0;
  if(t>=times[times.length-1]+step)return -1;
  for(let i=0;i<times.length;i++)if(t>=times[i]&&(i===times.length-1||t<times[i+1]))return i;
  return -1;
}
// Default scrubber selection: today -> the current hour (or the next window before the series, the last slot after it); other days -> first window.
export function defaultSlotIndex(slots, now, isToday, inWindow=()=>false) {
  const n=(slots??[]).length; if(!n)return 0;
  const first=Math.max(0,slots.findIndex(x=>inWindow(x.at)));
  if(!isToday)return first;
  const i=slotIndexAt(slots,now); if(i>=0)return i;
  const t=+new Date(now);
  if(Number.isFinite(t)&&t<Date.parse(slots[0].at)){ const up=slots.findIndex(x=>Date.parse(x.at)>=t&&inWindow(x.at)); return up>=0?up:0; }
  return n-1;
}
export function nearestSlotIndex(slots, now) {
  const t=+new Date(now), times=(slots??[]).map(x=>Date.parse(x.at));
  if(!Number.isFinite(t)||!times.length)return -1;
  return times.reduce((best,x,i)=>Math.abs(x-t)<Math.abs(times[best]-t)?i:best,0);
}
export const excludeSpot = (rows, spotId) => (rows??[]).filter(x=>x.loc?.id!==spotId);
export function rankSpeciesRows(rows) { return [...rows].sort((a,b)=>Number(a.best?.eligibility!=="realistic")-Number(b.best?.eligibility!=="realistic")||(b.suit??-1)-(a.suit??-1)); }
export function bestUpcomingCandidate(candidates, now) {
  const sorted=[...(candidates??[])].sort((a,b)=>(b.suitability??-1)-(a.suitability??-1));
  return sorted.find(x=>!x.window?.end||Date.parse(x.window.end)>+new Date(now))??sorted[0]??null;
}
export function formatFreshness(run, now) {
  const sources=run.inputs?.sourceStatus ?? [];
  const all=[...sources, ...(run.recommendation.freshness ? [run.recommendation.freshness] : [])];
  if (!all.length) return FRESHNESS_COPY.unavailable;
  const labels=[];
  for (const s of all) {
    const issued=s.issuedAt ? asDate(s.issuedAt) : null;
    const observed=s.observedAt ? asDate(s.observedAt) : null;
    const fetched=s.fetchedAt ? asDate(s.fetchedAt) : null;
    const ref=validDate(issued??new Date(NaN))?issued:validDate(observed??new Date(NaN))?observed:fetched;
    const age=ref && validDate(ref) ? Math.max(0,Math.floor((asDate(now)-ref)/60000)) : s.ageMinutes;
    const stale=s.stale===true || s.status==="stale";
    const status=s.available===false || s.status==="unavailable" ? FRESHNESS_COPY.unavailable : stale ? FRESHNESS_COPY.stale : s.usedFallback ? FRESHNESS_COPY.fallback : FRESHNESS_COPY.current;
    const source=s.label ?? s.source ?? s.kind;
    labels.push(`${source ? `${source}: ` : ""}${status}${status!==FRESHNESS_COPY.unavailable&&Number.isFinite(age) ? ` · ${age} min old` : ""}`);
  }
  return [...new Set(labels)].join("; ");
}
export function formatWhenLabel(run, now) {
  const w=run.recommendation.window ?? run.recommendation;
  const start=asDate(w.start), end=asDate(w.end), current=asDate(now);
  if (!validDate(start)||!validDate(end)||!validDate(current)) return formatCopyMessage(run.recommendation.whenLabel);
  const dateKey=localDateKey(start), nowKey=localDateKey(current);
  const dayLabel=dateKey===nowKey ? "Today" : dateKey===localDateKey(new Date(+current+86400000)) ? "Tomorrow" : new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"long",month:"short",day:"numeric"}).format(start);
  const part=prettyPart(w.partOfDay ?? run.recommendation.partOfDay);
  return `${dayLabel}${part ? ` ${part}` : ""} · ${timeRangeText(start,end)}`;
}
export function formatWindowStatus(run, now, window=run.recommendation.window) {
  const start=asDate(window.start), end=asDate(window.end), current=asDate(now);
  if (![start,end,current].every(validDate)) return "Window time unavailable";
  if (current>=start && current<end) return `Open now · ends in ${Math.max(1,Math.ceil((end-current)/60000))} min`;
  if (current>=end) return "Window ended";
  const minutes=Math.max(0,Math.ceil((start-current)/60000));
  return `Opens in ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes/60)} hr${Math.floor(minutes/60)===1?"":"s"}${minutes%60?` ${minutes%60} min`:""}`}`;
}
export function formatHistoricalRate(rate, mode) {
  if (!rate || rate.rate==null || rate.n==null) return "Survey history unavailable";
  const source=rate.sourceLabel ?? (mode==="inshore" ? "river, bridge and bank surveys" : "pier and beach surveys");
  const month=monthText(rate.month);
  if (rate.n < 80 || rate.lowSample) {
    const band=rate.band ?? "Survey rate";
    return `${band} in ${month} surveys — low sample (${source}).`;
  }
  const n=Math.round(10*rate.rate);
  const frequency=n<1 ? "Fewer than 1 in 10" : `About ${n} in 10`;
  return `${frequency} Northeast Florida shore fishing trips caught one in ${month} (2015–2025 surveys); ${source}.`;
}
export function formatRates(run, _now) {
  return (run.recommendation.targets ?? []).map(t=>({speciesId:t.speciesId,text:formatHistoricalRate(t.historicalRate,run.recommendation.mode)}));
}
export function formatHistoryNotes(run) {
  const inshore=run.recommendation.mode==="inshore";
  return (run.recommendation.targets??[]).map(target=>{
    const notes=Array.isArray(target.historyNotes)?[...target.historyNotes]:[];
    if(inshore&&!notes.some(x=>x.code==="history.inshoreSpread"))notes.unshift(INSHORE_SPREAD_COPY);
    return {speciesId:target.speciesId,notes:notes.map(x=>({code:x.code,text:formatCopyMessage(x)}))};
  }).filter(x=>x.notes.length);
}
export function formatRunCopy(run, now) {
  return {
    headline:formatHeadline(run,now), whenLabel:formatWhenLabel(run,now), useLine:formatUseLine(run,now),
    ...(run.recommendation.benchmarkLine?{benchmarkLine:formatCopyMessage(run.recommendation.benchmarkLine)}:{}),
    reason:formatReason(run,now), gates:formatGates(run,now), confidence:formatConfidence(run,now),
    freshness:formatFreshness(run,now), windowStatus:formatWindowStatus(run,now), historicalRates:formatRates(run,now),historyNotes:formatHistoryNotes(run),
  };
}

export function formatVerdictLine(run) {
  const r=run.recommendation, name=r.targets?.find(x=>x.speciesId===r.driverSpeciesId)?.name??r.headline?.text?.split(" ")[0]??"Fishing";
  return `${r.verdict} — ${name} at ${r.displayName}, ${formatWhenLabel(run,run.generatedAt)}`;
}
