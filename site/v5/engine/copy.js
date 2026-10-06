/** Pure, shared copy generation. Every clock-dependent result accepts an explicit `now`. */
export const REASON_COPY = Object.freeze({
  forecastUnavailable: "The forecast is unavailable.",
  wavesUnavailableToday: "Can't confirm the surf right now.",
  wavesUnavailableTomorrow: "No surf forecast for tomorrow yet.",
  historyUnavailable: "Survey history is unavailable for this fish.",
  notRealistic: "Survey history is too low to make this a realistic target.",
});
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

/** Resolve a coded CopyMessage with its stored fallback text. */
export function formatCopyMessage(message) {
  if (message == null) return "";
  if (typeof message === "string") return message;
  if (typeof message.text === "string" && message.text) return message.text;
  const table = message.kind === "gate" ? GATE_COPY : message.kind === "reason" ? REASON_COPY : {};
  return table[message.code] ?? message.code ?? "";
}
export const formatHeadline = (run, _now) => formatCopyMessage(run.recommendation.headline);
export const formatUseLine = (run, _now) => formatCopyMessage(run.recommendation.useLine);
export const formatReason = (run, _now) => formatCopyMessage(run.recommendation.reason?.text ?? run.recommendation.reason);
export function formatGates(run, _now) { return (run.recommendation.gates ?? []).map(g=>formatCopyMessage(g.text ?? g)); }
export function formatConfidence(run, _now) {
  const r=run.recommendation, label=CONFIDENCE_COPY[r.confidenceLevel] ?? `${r.confidenceLevel ?? "Unknown"} confidence`;
  const summary=formatCopyMessage(r.confidenceSummary);
  const reasons=(r.confidenceReasons ?? []).map(x=>formatCopyMessage(x.text ?? x)).filter(Boolean);
  return [label, Number.isFinite(r.confidence) ? String(Math.round(r.confidence)) : null, summary || reasons.join("; ")].filter(Boolean).join(" · ");
}
export function formatFreshness(run, now) {
  const sources=run.inputs?.sourceStatus ?? [];
  const all=[...sources, ...(run.recommendation.freshness ? [run.recommendation.freshness] : [])];
  if (!all.length) return FRESHNESS_COPY.unavailable;
  const labels=[];
  for (const s of all) {
    const fetched=s.fetchedAt ? asDate(s.fetchedAt) : null;
    const observed=s.observedAt ? asDate(s.observedAt) : null;
    const ref=validDate(fetched ?? new Date(NaN)) ? fetched : observed;
    const age=ref && validDate(ref) ? Math.max(0,Math.floor((asDate(now)-ref)/60000)) : s.ageMinutes;
    const stale=s.stale===true || s.status==="stale";
    const status=s.available===false || s.status==="unavailable" ? FRESHNESS_COPY.unavailable : stale ? FRESHNESS_COPY.stale : s.usedFallback ? FRESHNESS_COPY.fallback : FRESHNESS_COPY.current;
    const source=s.label ?? s.source ?? s.kind;
    labels.push(`${source ? `${source}: ` : ""}${status}${Number.isFinite(age) ? ` · ${age} min old` : ""}`);
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
export function formatRunCopy(run, now) {
  return {
    headline:formatHeadline(run,now), whenLabel:formatWhenLabel(run,now), useLine:formatUseLine(run,now),
    reason:formatReason(run,now), gates:formatGates(run,now), confidence:formatConfidence(run,now),
    freshness:formatFreshness(run,now), windowStatus:formatWindowStatus(run,now), historicalRates:formatRates(run,now),
  };
}
