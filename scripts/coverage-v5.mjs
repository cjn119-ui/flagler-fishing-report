import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadFirstCoastHistory,getHistoricalTiming } from "../site/v5/engine/history.js";
import { MODEL_PARAMS } from "../site/v5/engine/params.js";
import { calculateFactors } from "../site/v5/engine/factors.js";
import { calculateConfidence,verdictFor,scoreSpecies } from "../site/v5/engine/model.js";
import { getAstronomy } from "../site/v5/engine/astro.js";
import { ACTIVE_SPOTS } from "../site/v5/spots.js";
import { SPECIES } from "../site/v5/species.js";
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const history=await loadFirstCoastHistory({readJson:async()=>JSON.parse(fs.readFileSync(path.join(root,"site/v5/data/first-coast-history.json"),"utf8"))});
// Reachability fixture: all factors are set to favourable but locally plausible values;
// test every active spot/mode/month, selecting only catalog-listed realistic species.
// Tide is omitted in this single-slot screen; the end-to-end screen below uses the
// documented .5 ft/hr candidate only to measure reachability.
const candidateParams={...MODEL_PARAMS,history:{...MODEL_PARAMS.history,realisticFloor:0.05},thresholds:{...MODEL_PARAMS.thresholds,goSuitabilityMin:70},factors:{...MODEL_PARAMS.factors,tide:{...MODEL_PARAMS.factors.tide,rateNormalizationScale:0.5,rateNormalizationScaleProvisional:false}}};
const modes=["surf","pier","inshore"],summary=Object.fromEntries(modes.map(m=>[m,{cells:0,realisticCells:0,goCells:0,goLocations:new Set(),speciesCandidates:0,bySpot:{}}]));
const noTarget=[];
for(const spot of ACTIVE_SPOTS)for(const mode of spot.modes)for(let month=1;month<=12;month++){
 const s=summary[mode];s.cells++;const loc=s.bySpot[spot.id]??(s.bySpot[spot.id]={cells:0,realistic:0,go:0});loc.cells++;
 const choices=SPECIES.filter(x=>x.modes.includes(mode)&&spot.targets.includes(x.id)&&!x.bycatch&&!(x.needsStructure&&!new Set(["pier","jetty","bridge","dock","seawall","rocks"]).has(spot.structure)));
 let best=null,hasRealistic=false;
 for(const species of choices){const timing=getHistoricalTiming(history,{speciesId:species.id,mripAliases:species.mrip,mode,start:`2026-${String(month).padStart(2,"0")}-15T12:00:00Z`,end:`2026-${String(month).padStart(2,"0")}-15T12:30:00Z`});
   const rate=timing.historicalRate.rate;if(rate==null||rate<candidateParams.history.realisticFloor)continue;
   hasRealistic=true;s.speciesCandidates++;
   const [min,lo,hi,max]=species.waterF,waterTempF=(lo+hi)/2;
   const surfClass=species.surf??"moderate",waveHeightM=surfClass==="calm"?.3:surfClass==="moderate"?.9:1.5;
   const day=`2026-${String(month).padStart(2,"0")}-15`,at=getAstronomy(day,spot.lat,spot.lon).sun.sunrise;
   const conditions={at,windMph:6,windGustMph:8,windDirectionDeg:(spot.windExposure?.facingDeg??90)+180,waterTempF,waveHeightM,rainPct:0,thunder:false,tideRateFtPerHr:null,pressureChange6hHpa:-1,alerts:[]};
   const factors=calculateFactors({species,mode,conditions,at:conditions.at,historyTiming:timing,spot,params:candidateParams});
   const conf=calculateConfidence({conditions,mode,spot,historyN:timing.historicalRate.n,historyAvailable:true,forecastAgeHours:1,alertsChecked:true,wavesAvailable:true,params:candidateParams});
   const eligibility="realistic", verdict=verdictFor({suitability:factors.suitability,confidence:conf.confidence,eligibility,conditionsReady:true,params:candidateParams});
   const item={species:species.id,score:factors.suitability,verdict};if(!best||item.score>best.score)best=item;
 }
 if(hasRealistic){s.realisticCells++;loc.realistic++;}if(best?.verdict==="GO"){s.goCells++;s.goLocations.add(spot.id);loc.go++;}else if(!best)noTarget.push(`${spot.id}/${mode}/${month}`);
}
console.log("V5 factor-level synthetic screen (one instant; not a recommendation, frequency estimate, or acceptance)");
console.log("Method: checked forecast and alerts, favorable single-slot conditions. Model params remain provisional; screen candidates are GO threshold 70 and realistic floor .05. Tide input omitted in this legacy screen.");
for(const mode of modes){const s=summary[mode];console.log(`${mode}: candidate factor-level GO ${s.goCells}/${s.cells} location-month cells across ${s.goLocations.size}/${ACTIVE_SPOTS.filter(x=>x.modes.includes(mode)).length} locations; realistic candidates ${s.realisticCells}/${s.cells}.`);}
if(noTarget.length)console.log(`Factor screen cells without realistic targets: ${noTarget.length}`);

// End-to-end recommendation coverage: scoreSpecies receives six contiguous 30-minute
// slots, including a physically plausible semidiurnal tide-rate series. Parameters below
// are test candidates only; none are written to MODEL_PARAMS or used by the app.
function runCoverage(historyInput,tideAmplitudeFtPerHr){
  const result=Object.fromEntries(modes.map(mode=>[mode,{denominator:0,realisticCells:0,windowCells:0,goCells:0,goWindows:0,basis:{relativeCapped:0,absoluteOnly:0,unavailable:0},bySpot:{}}]));
  for(const spot of ACTIVE_SPOTS)for(const mode of spot.modes)for(let month=1;month<=12;month++){
    const summary=result[mode];summary.denominator++;const loc=summary.bySpot[spot.id]??(summary.bySpot[spot.id]={denominator:0,realistic:0,window:0,go:0});loc.denominator++;
    const day=`2026-${String(month).padStart(2,"0")}-15`,slots=Array.from({length:6},(_,i)=>new Date(Date.UTC(2026,month-1,15,14,i*30)).toISOString());let anyRealistic=false,bestWindows=[];
    for(const species of SPECIES.filter(x=>x.modes.includes(mode)&&spot.targets.includes(x.id))){
      const [min,lo,hi,max]=species.waterF??[60,68,72,82],waterTempF=(lo+hi)/2,surfClass=species.surf??"moderate",waveHeightM=surfClass==="calm"?0.3:surfClass==="moderate"?0.9:1.5;
      const scored=scoreSpecies({species,spot,mode,history:historyInput,slots,now:slots[0],forecastAgeHours:1,alertsChecked:true,waveCoverage:()=>true,params:candidateParams,conditionsAt:at=>{const hours=(Date.parse(at)-Date.parse(`${day}T00:00:00Z`))/3600000;return {at,windMph:6,windGustMph:8,windDirectionDeg:(spot.windExposure?.facingDeg??90)+180,waterTempF,waveHeightM,rainPct:0,thunder:false,tideRateFtPerHr:tideAmplitudeFtPerHr*Math.cos(2*Math.PI*hours/12.42),pressureChange6hHpa:-1,alerts:[]};}});
      if(!scored)continue;
      const timing=scored.slots[0]?.historyTiming;
      if(!timing?.seasonAvailable)summary.basis.unavailable++;else if(timing.seasonBasis in summary.basis)summary.basis[timing.seasonBasis]++;
      if(scored.slots.length!==6||scored.slots.some((x,i)=>i>0&&Date.parse(x.at)-Date.parse(scored.slots[i-1].at)!==30*60000))throw new Error(`Non-contiguous 30-minute slot series: ${spot.id}/${mode}/${month}/${species.id}`);
      if(scored.windows.some(w=>{const minutes=(Date.parse(w.end)-Date.parse(w.start))/60000;return minutes<60||minutes>150;}))throw new Error(`scoreSpecies returned an out-of-range window: ${spot.id}/${mode}/${month}/${species.id}`);
      if(scored.eligibility==="realistic")anyRealistic=true;bestWindows.push(...scored.windows);
    }
    if(anyRealistic){summary.realisticCells++;loc.realistic++;}if(bestWindows.length){summary.windowCells++;loc.window++;}const go=bestWindows.filter(w=>w.verdict==="GO");if(go.length){summary.goCells++;summary.goWindows+=go.length;loc.go++;}
  }
  return result;
}
const e2e=runCoverage(history,0.25);
console.log("V5 end-to-end synthetic coverage (scoreSpecies through caps, eligibility, confidence, gates, 60–150 minute windows, final verdict; not hindcast/frequency/acceptance)");
console.log("Candidate-only parameters: GO threshold 70, realistic floor .05, tide rate scale .5 ft/hr. These remain provisional. Each cell uses six contiguous 30-minute slots, checked forecast/alerts, tide-rate sinusoid with 12.42-hour semidiurnal period and 0.25 ft/hr amplitude, ideal temperature, species-matched plausible waves, safe wind, dry conditions, and falling pressure.");
for(const mode of modes){const summary=e2e[mode],active=ACTIVE_SPOTS.filter(x=>x.modes.includes(mode)).length;console.log(`${mode}: GO ${summary.goCells}/${summary.denominator} active location×mode×month cells; GO windows ${summary.goWindows}; cells with a qualifying window ${summary.windowCells}; cells with realistic candidates ${summary.realisticCells}; denominator ${active} active locations × 12 months = ${summary.denominator}.`);console.log(`  season basis (species × spot × month evaluations): relativeCapped ${summary.basis.relativeCapped}, absoluteOnly ${summary.basis.absoluteOnly}, unavailable ${summary.basis.unavailable}`);for(const [id,value] of Object.entries(summary.bySpot))console.log(`  ${id}: denominator ${value.denominator}, GO ${value.go}, window ${value.window}, realistic ${value.realistic}`);}

// Force the conservative cap fallback in a cloned history to represent D1+D2 without R1.
// The frozen artifact is never mutated, and the ocean formula remains exactly the .20 cap.
const fallbackHistory=structuredClone(history);fallbackHistory.inland.all.personalAnyCatchTrips=0;
const fallbackControl=runCoverage(fallbackHistory,0.25),oceanUnchanged=["surf","pier"].every(mode=>e2e[mode].goCells===fallbackControl[mode].goCells);
console.log(`R1 reference fallback control (D1+D2): surf ${fallbackControl.surf.goCells}/${fallbackControl.surf.denominator}, pier ${fallbackControl.pier.goCells}/${fallbackControl.pier.denominator}, inshore ${fallbackControl.inshore.goCells}/${fallbackControl.inshore.denominator}; ocean counts unchanged by R1: ${oceanUnchanged?"PASS":"FAIL"}.`);
if(!oceanUnchanged)throw new Error("R1 changed surf or pier GO coverage against the reference-fallback control");
const sensitivity=runCoverage(history,0.6);
console.log(`Sensitivity only, tide amplitude 0.6 ft/hr (informational; not an acceptance target): surf ${sensitivity.surf.goCells}/${sensitivity.surf.denominator}, pier ${sensitivity.pier.goCells}/${sensitivity.pier.denominator}, inshore ${sensitivity.inshore.goCells}/${sensitivity.inshore.denominator}.`);
