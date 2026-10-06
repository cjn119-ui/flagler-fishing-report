const DAY=86400000, RAD=Math.PI/180, SYNODIC=29.530588853;
const dateValue = d => {
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  if (typeof d === "string" && /^\d{4}-\d\d-\d\d$/.test(d)) return new Date(`${d}T00:00:00Z`);
  const x=new Date(d); return Number.isFinite(+x)?new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth(),x.getUTCDate())):null;
};
const iso = ms => new Date(ms).toISOString();
const norm = x => ((x%360)+360)%360;
const jd = ms => ms/DAY+2440587.5;
const deg = r => r/RAD;
const rad = d => d*RAD;
const fmtDate = (d, h) => { const ms=+d+h*3600000; return iso(ms); };

// NOAA Solar Calculator equations (fractional UTC hour; altitude -0.833° for apparent sunrise).
function solarUtcHour(date, lat, lon, zenith, rising) {
  const n=Math.floor((+date-Date.UTC(date.getUTCFullYear(),0,0))/DAY);
  const lngHour=lon/15, t=n+((rising?6:18)-lngHour)/24;
  const M=0.9856*t-3.289;
  let L=M+1.916*Math.sin(rad(M))+0.020*Math.sin(2*rad(M))+282.634; L=norm(L);
  let RA=deg(Math.atan(0.91764*Math.tan(rad(L)))); RA=norm(RA); RA+=(Math.floor(L/90)*90-Math.floor(RA/90)*90);
  const sinDec=0.39782*Math.sin(rad(L)), cosDec=Math.cos(Math.asin(sinDec));
  const cosH=(Math.cos(rad(zenith))-sinDec*Math.sin(rad(lat)))/(cosDec*Math.cos(rad(lat)));
  if(cosH>1||cosH< -1)return null;
  const H=(rising?360-deg(Math.acos(cosH)):deg(Math.acos(cosH)))/15;
  const T=H+RA/15-0.06571*t-6.622;
  return ((T-lngHour)%24+24)%24;
}
function solarEvent(date,lat,lon,kind,zenith=90.833){
  const h=solarUtcHour(date,lat,lon,zenith,kind==="rise"); if(h==null)return null;
  // NOAA's rounded fractional hour is sometimes on the adjacent UTC date.
  const transit=((12-lon/15)%24+24)%24;
  const normalized=kind==="rise"&&h>transit?h-24:kind==="set"&&h<transit?h+24:h;
  const guess=+date+normalized*3600000;
  return iso(guess);
}
function sunTransit(date,lon){
  const n=Math.floor((+date-Date.UTC(date.getUTCFullYear(),0,0))/DAY),gamma=2*Math.PI/365*(n-1);
  const eot=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  return iso(+date+(720-4*lon-eot)*60000);
}

const localParts = ms => Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
function localMidnight(day){
  const [y,m,d]=day.toISOString().slice(0,10).split("-").map(Number),wall=Date.UTC(y,m-1,d);
  const offset=ms=>{const p=localParts(ms);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-ms;};
  let guess=wall-offset(wall);for(let i=0;i<3;i++)guess=wall-offset(guess);return guess;
}

// Low-precision geocentric lunar coordinates (Schlyter orbital elements); ample for solunar windows.
function moonEquatorial(ms){
  const d=jd(ms)-2451543.5;
  const N=norm(125.1228-0.0529538083*d), i=5.1454, w=norm(318.0634+0.1643573223*d);
  const a=60.2666, e=0.0549, M=norm(115.3654+13.0649929509*d);
  let E=M+deg(e*Math.sin(rad(M))*(1+e*Math.cos(rad(M))));
  for(let k=0;k<4;k++) E-= (E-deg(e*Math.sin(rad(E)))-M)/(1-e*Math.cos(rad(E)));
  const xv=a*(Math.cos(rad(E))-e), yv=a*Math.sqrt(1-e*e)*Math.sin(rad(E));
  const v=deg(Math.atan2(yv,xv)), r=Math.hypot(xv,yv);
  const xh=r*(Math.cos(rad(N))*Math.cos(rad(v+w))-Math.sin(rad(N))*Math.sin(rad(v+w))*Math.cos(rad(i)));
  const yh=r*(Math.sin(rad(N))*Math.cos(rad(v+w))+Math.cos(rad(N))*Math.sin(rad(v+w))*Math.cos(rad(i)));
  const zh=r*Math.sin(rad(v+w))*Math.sin(rad(i));
  const eps=23.4393-3.563e-7*d;
  const xe=xh, ye=yh*Math.cos(rad(eps))-zh*Math.sin(rad(eps)), ze=yh*Math.sin(rad(eps))+zh*Math.cos(rad(eps));
  return { ra:norm(deg(Math.atan2(ye,xe))), dec:deg(Math.atan2(ze,Math.hypot(xe,ye))) };
}
function moonAltitude(ms,lat,lon){
  const {ra,dec}=moonEquatorial(ms), T=(jd(ms)-2451545)/36525;
  const gmst=norm(280.46061837+360.98564736629*(jd(ms)-2451545)+0.000387933*T*T-T*T*T/38710000);
  const H=rad(norm(gmst+lon-ra+180)-180);
  return deg(Math.asin(Math.sin(rad(lat))*Math.sin(rad(dec))+Math.cos(rad(lat))*Math.cos(rad(dec))*Math.cos(H)));
}
function findMoonEvents(date,lat,lon){
  const start=localMidnight(date),end=localMidnight(new Date(+date+DAY)),step=5*60000,events=[];
  let previousTime=start,prev=moonAltitude(start,lat,lon)+0.125;
  for(let t=Math.min(start+step,end);t<=end;t=Math.min(t+step,end)){
    const v=moonAltitude(t,lat,lon)+0.125;
    if((prev<0&&v>=0)||(prev>=0&&v<0)){let lo=previousTime,hi=t;for(let j=0;j<24;j++){const m=(lo+hi)/2,a=moonAltitude(m,lat,lon)+0.125;if((prev<0)===(a<0))lo=m;else hi=m;}const eventTime=(lo+hi)/2;if(eventTime>=start&&eventTime<end)events.push({type:v>prev?"rise":"set",time:iso(eventTime)});}
    previousTime=t;prev=v;if(t===end)break;
  }
  const refine=(maximize)=>{const times=[];for(let t=start;t<end;t+=step)times.push(t);times.push(end);const values=times.map(t=>moonAltitude(t,lat,lon)*(maximize?1:-1));let index=0;for(let i=1;i<values.length;i++)if(values[i]>values[index])index=i;
    if(index===0||index===times.length-1)return null;
    const a=values[index-1],b=values[index],c=values[index+1],den=a-2*b+c;if(!(b>=a&&b>=c)||den===0)return null;
    const delta=(a-c)/(2*den),bounded=Math.max(-1,Math.min(1,delta)),best=times[index]+bounded*step;
    return best>=start&&best<end?best:null;};
  const transit=refine(true),underfoot=refine(false);
  if(transit!==null)events.push({type:"transit",time:iso(transit)});
  if(underfoot!==null)events.push({type:"underfoot",time:iso(underfoot)});
  return events.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
}
function phaseAt(ms){
  const age=((ms-Date.UTC(2000,0,6,18,14))/DAY%SYNODIC+SYNODIC)%SYNODIC;
  const phase=age/SYNODIC, illumination=(1-Math.cos(2*Math.PI*phase))/2;
  const name=phase<0.03||phase>=0.97?"new":phase<0.22?"waxing-crescent":phase<0.28?"first-quarter":phase<0.47?"waxing-gibbous":phase<0.53?"full":phase<0.72?"waning-gibbous":phase<0.78?"last-quarter":"waning-crescent";
  return {phase,illumination,name,ageDays:age};
}
function eventPeriod(event, minutes=60, bounds=null){const t=Date.parse(event.time),start=Math.max(bounds?.start??-Infinity,t-minutes*60000),end=Math.min(bounds?.end??Infinity,t+minutes*60000);return {start:iso(start),end:iso(end),event:event.type};}

/** Pure ephemeris for a UTC date key and coordinates. Display/time-zone conversion belongs to callers. */
export function getAstronomy(date,lat,lon){
  const day=dateValue(date); if(!day||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new TypeError("Expected a date and valid latitude/longitude");
  const sunrise=solarEvent(day,lat,lon,"rise"), sunset=solarEvent(day,lat,lon,"set");
  const civilDawn=solarEvent(day,lat,lon,"rise",96), civilDusk=solarEvent(day,lat,lon,"set",96);
  const interval={start:localMidnight(day),end:localMidnight(new Date(+day+DAY))},moon=phaseAt((interval.start+interval.end)/2), moonEvents=findMoonEvents(day,lat,lon);
  const transit=moonEvents.find(x=>x.type==="transit"),underfoot=moonEvents.find(x=>x.type==="underfoot");
  const major=[transit&&eventPeriod(transit,60,interval),underfoot&&eventPeriod(underfoot,60,interval)].filter(Boolean);
  const minor=moonEvents.filter(x=>x.type==="rise"||x.type==="set").map(x=>eventPeriod(x,30,interval));
  return {date:day.toISOString().slice(0,10),sun:{sunrise,sunset,civilDawn,civilDusk,transit:sunTransit(day,lon)},moon:{...moon,events:moonEvents,transit:transit?.time??null,underfoot:underfoot?.time??null},solunar:{major,minor}};
}
export const moonPhase = date => phaseAt(+dateValue(date)+12*3600000);
export const solarEvents = (date,lat,lon) => {const x=getAstronomy(date,lat,lon);return x.sun;};
